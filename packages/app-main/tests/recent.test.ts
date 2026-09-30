import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readProjectInfo, RecentProjects } from "../src/project/recent.js";

const dir = mkdtempSync(path.join(tmpdir(), "skeleton-recent-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function project(name: string): string {
  const root = path.join(dir, name.toLowerCase());
  mkdirSync(path.join(root, "skeleton"), { recursive: true });
  writeFileSync(path.join(root, "skeleton", "config.json"), JSON.stringify({ name }));
  return root;
}

describe("readProjectInfo", () => {
  it("reads the name from skeleton/config.json", async () => {
    const root = project("Alpha");
    await expect(readProjectInfo(root)).resolves.toEqual({ projectRoot: root, name: "Alpha" });
  });

  it("returns null for folders that aren't Skeleton projects", async () => {
    await expect(readProjectInfo(dir)).resolves.toBeNull();
    await expect(readProjectInfo(path.join(dir, "nope"))).resolves.toBeNull();
  });
});

describe("RecentProjects", () => {
  it("keeps most recent first, deduped, and marks missing projects", async () => {
    let t = 1000;
    const store = new RecentProjects(path.join(dir, "state", "recent.json"), () => t++);
    const a = project("A");
    const b = project("B");
    await store.touch({ projectRoot: a, name: "A" });
    await store.touch({ projectRoot: b, name: "B" });
    await store.touch({ projectRoot: a, name: "A" });
    expect((await store.list()).map((r) => [r.name, r.lastOpened, r.missing])).toEqual([
      ["A", 1002, false],
      ["B", 1001, false],
    ]);
    rmSync(b, { recursive: true, force: true });
    expect((await store.list()).find((r) => r.name === "B")?.missing).toBe(true);
    await store.forget(b);
    expect((await store.list()).map((r) => r.name)).toEqual(["A"]);
  });

  it("caps the list", async () => {
    const store = new RecentProjects(path.join(dir, "cap.json"));
    for (let i = 0; i < 20; i++) await store.touch({ projectRoot: `/p/${i}`, name: `P${i}` });
    const list = await store.list();
    expect(list).toHaveLength(12);
    expect(list[0]?.name).toBe("P19");
  });

  it("survives a corrupt file, and says so", async () => {
    const file = path.join(dir, "corrupt.json");
    writeFileSync(file, "{not json");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(new RecentProjects(file).list()).resolves.toEqual([]);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
