import { mkdtempSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../src/project/atomic.js";

const dir = mkdtempSync(path.join(tmpdir(), "skeleton-atomic-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("writeFileAtomic", () => {
  it("replaces the file, never exposing it empty, and leaves no temp file", async () => {
    const file = path.join(dir, "Page.tsx");
    writeFileSync(file, "old content\n");
    // Read the target on every change event, like Vite's watcher does.
    const seen: string[] = [];
    const watcher = watch(dir, (_event, name) => {
      if (name === "Page.tsx") {
        try {
          seen.push(readFileSync(file, "utf8"));
        } catch {
          seen.push("<missing>");
        }
      }
    });
    for (let i = 0; i < 20; i++) await writeFileAtomic(file, `export default function Page() { return ${i}; }\n`);
    await new Promise((r) => setTimeout(r, 100));
    watcher.close();
    expect(readFileSync(file, "utf8")).toBe("export default function Page() { return 19; }\n");
    expect(seen.filter((s) => s === "" || s === "<missing>")).toEqual([]);
    expect(readdirSync(dir)).toEqual(["Page.tsx"]);
  });

  it("cleans up the temp file when the rename fails", async () => {
    const target = path.join(dir, "missing-dir", "x.tsx");
    await expect(writeFileAtomic(target, "x")).rejects.toThrow();
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
