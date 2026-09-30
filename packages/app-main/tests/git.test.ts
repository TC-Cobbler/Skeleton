import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitError, GitService } from "../src/git/service.js";

const root = mkdtempSync(path.join(tmpdir(), "skeleton-git-"));
const git = new GitService();
const write = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
};
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

let first = "";
let second = "";

beforeAll(async () => {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  write(".gitignore", "node_modules\n");
  write("src/page.tsx", "one\n");
  write("src/keep.tsx", "keep\n");
  first = (await git.commit(root, "skeleton: scaffold"))?.hash ?? "";
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("GitService", () => {
  it("commits everything, and reports nothing to commit", async () => {
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(await git.commit(root, "nothing")).toBeNull();
    write("src/page.tsx", "one\ntwo\n");
    write("src/new.tsx", "new\n");
    rmSync(path.join(root, "src/keep.tsx"));
    write("node_modules/dep/index.js", "ignored");
    expect((await git.status(root)).changed.sort()).toEqual(["src/keep.tsx", "src/new.tsx", "src/page.tsx"]);
    const made = await git.commit(root, "agent: pass #1");
    second = made?.hash ?? "";
    expect(made?.subject).toBe("agent: pass #1");
    expect(await git.status(root)).toEqual({ head: second, clean: true, changed: [] });
    expect((await git.log(root, 10)).map((c) => c.subject)).toEqual(["agent: pass #1", "skeleton: scaffold"]);
  });

  it("diffs two commits file by file", async () => {
    const diff = await git.diff(root, first, second);
    expect(diff.from).toBe(first);
    expect(diff.to).toBe(second);
    expect(diff.files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ["src/keep.tsx", "deleted", 0, 1],
      ["src/new.tsx", "added", 1, 0],
      ["src/page.tsx", "modified", 1, 0],
    ]);
    expect(diff.files.find((f) => f.path === "src/page.tsx")?.patch).toContain("+two");
  });

  it("diffs against the working tree", async () => {
    write("src/page.tsx", "changed\n");
    const diff = await git.diff(root, second, null);
    expect(diff.to).toBeNull();
    expect(diff.files.map((f) => f.path)).toEqual(["src/page.tsx"]);
    execFileSync("git", ["checkout", "-q", "--", "src/page.tsx"], { cwd: root });
  });

  it("refuses to revert over uncommitted changes", async () => {
    write("src/page.tsx", "unsaved work\n");
    await expect(git.revert(root, first)).rejects.toThrow(/uncommitted changes \(src\/page.tsx\)/);
    expect(read("src/page.tsx")).toBe("unsaved work\n");
    execFileSync("git", ["checkout", "-q", "--", "src/page.tsx"], { cwd: root });
  });

  it("reverts to a commit as a new commit, keeping history and ignored files", async () => {
    const reverted = await git.revert(root, first);
    expect(reverted.subject).toBe(`skeleton: revert to ${first.slice(0, 7)}`);
    expect(read("src/page.tsx")).toBe("one\n");
    expect(read("src/keep.tsx")).toBe("keep\n");
    expect(existsSync(path.join(root, "src/new.tsx"))).toBe(false);
    expect(existsSync(path.join(root, "node_modules/dep/index.js"))).toBe(true);
    expect((await git.log(root, 10)).map((c) => c.subject)).toEqual([
      reverted.subject,
      "agent: pass #1",
      "skeleton: scaffold",
    ]);
    // The revert is itself undoable.
    await git.revert(root, second);
    expect(read("src/page.tsx")).toBe("one\ntwo\n");
    expect(await git.status(root)).toMatchObject({ clean: true });
  });

  it("makes an empty commit only when asked (loop markers, ADR 011)", async () => {
    expect(await git.commit(root, "agent: pass #2")).toBeNull();
    const marked = await git.commit(root, "agent: pass #2", { allowEmpty: true });
    expect(marked?.subject).toBe("agent: pass #2");
    expect((await git.diff(root, `${marked?.hash}`, null)).files).toEqual([]);
  });

  it("reads a commit's files under some paths, and finds the root commit", async () => {
    expect(await git.snapshot(root, first, ["src"])).toEqual({ "src/keep.tsx": "keep\n", "src/page.tsx": "one\n" });
    expect(await git.snapshot(root, second, ["src/new.tsx", "missing"])).toEqual({ "src/new.tsx": "new\n" });
    expect(await git.rootCommit(root)).toBe(first);
  });

  it("rejects things that aren't commits", async () => {
    await expect(git.diff(root, "HEAD~1", null)).rejects.toThrow(GitError);
    await expect(git.revert(root, "deadbeef")).rejects.toThrow(/unknown commit deadbeef/);
    await expect(git.revert(root, (await git.status(root)).head)).rejects.toThrow(/already at/);
    await expect(git.commit(root, "   ")).rejects.toThrow(/message is empty/);
  });
});
