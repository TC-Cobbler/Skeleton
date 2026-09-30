import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { introduced, WorkerChecker, type Diagnostic } from "../src/project/checker.js";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/base");
const root = mkdtempSync(path.join(tmpdir(), "skeleton-checker-"));
cpSync(fixture, root, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(`${path.sep}dist`) });
symlinkSync(path.join(fixture, "node_modules"), path.join(root, "node_modules"), "dir");
// The worker is compiled; tests run it from dist like the app does.
const script = new URL("../dist/project/checker-worker.js", import.meta.url);
let checker: WorkerChecker | null = null;
afterAll(() => {
  checker?.dispose();
  rmSync(root, { recursive: true, force: true });
});

describe("WorkerChecker (T3.7)", () => {
  it("reports the project's type errors, incrementally after edits", async () => {
    checker = new WorkerChecker(root, script);
    expect(await checker.check()).toEqual([]);
    const home = path.join(root, "src/pages/HomePage.tsx");
    const source = readFileSync(home, "utf8");
    writeFileSync(home, source.replace(`direction="horizontal"`, `direction="sideways"`));
    const t0 = Date.now();
    const errors = await checker.check();
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: "src/pages/HomePage.tsx", code: 2322 });
    expect(errors[0]?.message).toContain(`"sideways"`);
    writeFileSync(home, source);
    expect(await checker.check()).toEqual([]);
  }, 60_000);

  it("restarts its worker after it dies", async () => {
    const c = new WorkerChecker(root, script);
    expect(await c.check()).toEqual([]);
    const worker = (c as unknown as { worker: { terminate(): Promise<number> } }).worker;
    await worker.terminate();
    await new Promise((r) => setTimeout(r, 50));
    expect(await c.check()).toEqual([]);
    c.dispose();
    await expect(c.check()).rejects.toThrow(/shut down/);
  }, 60_000);

  it("rejects when the project has no TypeScript", async () => {
    const bare = mkdtempSync(path.join(tmpdir(), "skeleton-checker-bare-"));
    writeFileSync(path.join(bare, "package.json"), "{}");
    const c = new WorkerChecker(bare, script);
    await expect(c.check()).rejects.toThrow(/TypeScript isn't installed/);
    c.dispose();
    rmSync(bare, { recursive: true, force: true });
  }, 60_000);
});

describe("introduced", () => {
  const d = (file: string, message: string, line = 1): Diagnostic => ({ file, line, code: 2322, message });
  it("finds new diagnostics, ignoring moved lines and counting repeats", () => {
    expect(introduced([d("a", "x", 3)], [d("a", "x", 9)])).toEqual([]);
    expect(introduced([d("a", "x")], [d("a", "x"), d("a", "x", 5)])).toEqual([d("a", "x", 5)]);
    expect(introduced([d("a", "x")], [])).toEqual([]);
    expect(introduced([], [d("b", "y")])).toEqual([d("b", "y")]);
  });
});
