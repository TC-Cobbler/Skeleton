import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ProjectWatcher } from "../src/project/watcher.js";

const root = mkdtempSync(path.join(tmpdir(), "skeleton-watch-"));
mkdirSync(path.join(root, "src/pages"), { recursive: true });
mkdirSync(path.join(root, "src/node_modules/x"), { recursive: true });
const watcher = new ProjectWatcher(undefined, 30);
afterAll(() => {
  watcher.stopAll();
  rmSync(root, { recursive: true, force: true });
});

const until = async (check: () => boolean) => {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 200));

describe("ProjectWatcher (real fs.watch)", () => {
  it("moves the revision on changes under src/, debounced, with the paths", async () => {
    expect(watcher.changes(root)).toEqual({ revision: 0, locked: false, changed: [], error: null });
    await settle();
    writeFileSync(path.join(root, "src/pages/HomePage.tsx"), "a");
    writeFileSync(path.join(root, "src/pages/Other.tsx"), "b");
    await until(() => watcher.changes(root).revision === 1);
    await settle();
    expect(watcher.changes(root).revision).toBe(1);
    expect(watcher.changes(root).changed.sort()).toEqual(["src/pages/HomePage.tsx", "src/pages/Other.tsx"]);
  });

  it("ignores node_modules", async () => {
    const before = watcher.changes(root).revision;
    writeFileSync(path.join(root, "src/node_modules/x/index.js"), "x");
    await settle();
    expect(watcher.changes(root).revision).toBe(before);
  });

  it("ignores changes while locked, then catches up once on unlock", async () => {
    const before = watcher.changes(root).revision;
    watcher.setLocked(root, true);
    writeFileSync(path.join(root, "src/pages/HomePage.tsx"), "agent edit 1");
    writeFileSync(path.join(root, "src/pages/HomePage.tsx"), "agent edit 2");
    await settle();
    expect(watcher.changes(root)).toMatchObject({ revision: before, locked: true });
    watcher.setLocked(root, false);
    expect(watcher.changes(root)).toMatchObject({ revision: before + 1, locked: false, changed: ["*"] });
  });

  it("reports a project without src/ instead of throwing", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "skeleton-watch-empty-"));
    expect(watcher.changes(empty).error).toMatch(/can't watch/);
    rmSync(empty, { recursive: true, force: true });
  });
});
