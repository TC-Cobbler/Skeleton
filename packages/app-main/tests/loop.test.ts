// The handoff loop (Phase 5) over a real git repository: a rendered template, a real
// Editor and GitService, a scripted agent pass, and a stubbed build.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIdIndex, parseHandoff, readNotes } from "@skeleton/core";
import { loadTemplate, renderProject } from "@skeleton/templates";
import { GitService } from "../src/git/service.js";
import type { BuildResult } from "../src/ipc/contract.js";
import { Editor, EditRefused, listSources } from "../src/project/editor.js";
import { Loop, LoopRefused } from "../src/project/loop.js";

const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-loop-"));
const root = path.join(scratch, "demo");
const HOME = "src/pages/HomePage.tsx";
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const write = (rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), content);
};
const git = new GitService();
const subjects = async () => (await git.log(root, 50)).map((c) => c.subject);
const locks: boolean[] = [];
let build: BuildResult = { ok: true, output: "", ms: 1 };
let loop: Loop;
const io = { readFile: (p: string) => readFile(p, "utf8"), writeFile: (p: string, c: string) => writeFile(p, c), listSources: (r: string) => listSources(r, readdir) };
// Declared before the loop exists: the editor asks it whether the project is locked.
const editor = new Editor({ ...io, deleteFile: async () => undefined }, { locked: (r) => loop.lockReason(r) });
let ids: Record<"container" | "stack" | "title", string>;

beforeAll(async () => {
  const files = renderProject(loadTemplate(), { name: "Demo", skeletonVersion: "0", random: (() => {
    let i = 0;
    return () => ((i++ * 13) % 36) / 36;
  })() });
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  await git.commit(root, "skeleton: scaffold");
  const home = read(HOME);
  ids = {
    container: /<Container data-ui-id="(ui_\w+)"/.exec(home)?.[1] as string,
    stack: /<Stack data-ui-id="(ui_\w+)"/.exec(home)?.[1] as string,
    title: /<h1 data-ui-id="(ui_\w+)"/.exec(home)?.[1] as string,
  };
  let n = 0;
  loop = new Loop({
    io,
    git,
    editor,
    build: async () => build,
    setLocked: (_r, locked) => locks.push(locked),
    now: () => new Date(2026, 8, 30, 12, 5),
    random: () => ((n++ * 7) % 36) / 36,
  });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("Loop", () => {
  it("starts with the user, with handoff #1 next", async () => {
    expect(await loop.status(root)).toEqual({ state: "with-user", handoff: null, pass: null, next: 1, summary: null });
    expect(await loop.lockReason(root)).toBeNull();
  });

  it("pins notes to elements (T5.1), and refuses a target that isn't in the project", async () => {
    await loop.writeNote(root, { op: "add", target: ids.title, type: "build", text: "Show the number of orders" });
    await loop.writeNote(root, { op: "add", target: ids.stack, type: "question", text: "Should this scroll?" });
    const view = await loop.writeNote(root, { op: "add", target: ids.container, type: "behaviour", text: "Resolved already" });
    const resolved = view.notes[2]?.id as string;
    await loop.writeNote(root, { op: "update", id: resolved, status: "resolved" });
    await expect(loop.writeNote(root, { op: "add", target: "ui_nope0", type: "build", text: "x" })).rejects.toThrow(LoopRefused);
    const notes = await loop.notes(root);
    expect(notes.notes.map((n) => [n.target, n.type, n.status, n.orphaned, n.element])).toEqual([
      [ids.title, "build", "open", false, "h1"],
      [ids.stack, "question", "open", false, "Stack"],
      [ids.container, "behaviour", "resolved", false, "Container"],
    ]);
  });

  it("won't hand off a project that doesn't build, or has duplicate IDs (T5.2)", async () => {
    build = { ok: false, output: "src/x.tsx(1,1): error TS1005", ms: 1 };
    await expect(loop.handoff(root)).rejects.toThrow(/doesn't build[\s\S]*TS1005/);
    build = { ok: true, output: "", ms: 1 };
    const home = read(HOME);
    write(HOME, home.replace(`<h1 data-ui-id="${ids.title}"`, `<p data-ui-id="${ids.title}">x</p>\n        <h1 data-ui-id="${ids.title}"`));
    await expect(loop.handoff(root)).rejects.toThrow(new RegExp(`Duplicate IDs: ${ids.title}`));
    write(HOME, home);
    expect(await subjects()).toEqual(["skeleton: scaffold"]);
  });

  it("hands off: HANDOFF.md with the open notes as tasks, one commit, locked (T5.2)", async () => {
    // A token change since the scaffold shows up under "Changes since last handoff".
    const css = read("src/styles/globals.css");
    write("src/styles/globals.css", css.replace(/--radius: [^;]+;/, "--radius: 1rem;"));
    const status = await loop.handoff(root);
    expect(status).toMatchObject({ state: "with-agent", handoff: { number: 1 }, next: 2, pass: null });
    expect(await subjects()).toEqual(["skeleton: handoff #1", "skeleton: scaffold"]);
    expect((await git.status(root)).clean).toBe(true);
    const md = read("HANDOFF.md");
    expect(md).toContain("# Handoff #1 — 2026-09-30 12:05");
    expect(md).toContain("- Token changes: --radius 0.625rem → 1rem");
    expect(parseHandoff(md).tasks).toEqual([
      { done: false, target: ids.title, type: "build", text: "Show the number of orders" },
      { done: false, target: ids.stack, type: "question", text: "Should this scroll?" },
    ]);
    expect(readNotes(read("skeleton/notes.json")).notes.map((n) => n.handoff)).toEqual([1, 1, null]);
    expect(locks.at(-1)).toBe(true);
  });

  it("refuses every edit and note while with the agent", async () => {
    await expect(editor.apply(root, HOME, { op: "setText", id: ids.title, text: "No" })).rejects.toThrow(EditRefused);
    await expect(editor.tokens(root, [{ name: "--radius", value: "2rem", mode: null }])).rejects.toThrow(/with the agent \(handoff #1\)/);
    await expect(loop.writeNote(root, { op: "add", target: ids.title, type: "build", text: "x" })).rejects.toThrow(/with the agent/);
    await expect(loop.handoff(root)).rejects.toThrow(/already with the agent/);
    await expect(loop.revert(root)).rejects.toThrow(/no pass to revert/);
  });

  it("takes back: commits the pass, resolves ticked notes, pins replies, repairs IDs, summarises (T5.3–T5.6)", async () => {
    // The agent: builds the count (a locked hook call), duplicates the title's ID on a
    // new element, adds an un-ID'd <p>, ticks one task and replies to both, and commits once itself.
    const home = read(HOME);
    write(
      "src/hooks/use-orders.ts",
      "export function useOrders() {\n  return { count: 3 };\n}\n",
    );
    write(
      HOME,
      home
        .replace('import { Container, Stack } from "@/components/layout";', 'import { Container, Stack } from "@/components/layout";\nimport { useOrders } from "@/hooks/use-orders";')
        .replace("export default function HomePage() {\n", "export default function HomePage() {\n  const { count } = useOrders();\n")
        .replace("        </h1>\n", `        </h1>\n        <p className="text-sm">{count} orders</p>\n        <span data-ui-id="${ids.title}">copy</span>\n`),
    );
    execFileSync("git", ["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qam", "feat: order count"], { cwd: root });
    write(
      "HANDOFF.md",
      read("HANDOFF.md")
        .replace(`- [ ] ${ids.title} · Build`, `- [x] ${ids.title} · Build`)
        .concat(`- ${ids.title} · Count comes from useOrders()\n- ${ids.stack} · No: the page is short\n`),
    );
    const status = await loop.takeBack(root);
    expect(status.state).toBe("with-user");
    expect(locks.at(-1)).toBe(false);
    expect((await subjects()).slice(0, 3)).toEqual(["agent: pass #1", "feat: order count", "skeleton: handoff #1"]);
    const s = status.summary;
    expect(s).not.toBeNull();
    if (!s) return;
    expect(status.pass).toMatchObject({ number: 1, commit: s.passCommit, handoffCommit: s.handoffCommit });
    expect(s.files.map((f) => [f.path, f.status])).toEqual([
      ["HANDOFF.md", "modified"],
      ["src/hooks/use-orders.ts", "added"],
      [HOME, "modified"],
    ]);
    expect(s.tasks).toEqual({ sent: 2, resolved: 1, unmatched: [] });
    expect(s.replies.map((r) => r.target)).toEqual([ids.title, ids.stack]);
    expect(s.repairs.map((r) => [r.kind, r.element, r.was])).toEqual([
      ["assigned", "p", null],
      ["reminted", "span", ids.title],
    ]);
    expect(s.breaches.map((b) => [b.rule, b.text])).toEqual([
      [1, `${ids.title} is used 2 times`],
      [1, "<p> has no data-ui-id"],
    ]);
    expect(s.build.ok).toBe(true);
    expect(s.orphanedNotes).toBe(0);
    // Repairs are on disk, uncommitted; the pass commit is the agent's alone.
    const after = read(HOME);
    expect(buildIdIndex({ [HOME]: after }).duplicates).toEqual([]);
    expect(after).toContain(`<h1 data-ui-id="${ids.title}"`);
    expect(after).toContain("const { count } = useOrders();");
    expect((await git.status(root)).changed.sort()).toEqual(["skeleton/notes.json", HOME]);
    const notes = await loop.notes(root);
    expect(notes.notes.map((n) => n.status)).toEqual(["resolved", "open", "resolved"]);
    expect(notes.replies).toEqual([
      { target: ids.title, text: "Count comes from useOrders()", pass: 1 },
      { target: ids.stack, text: "No: the page is short", pass: 1 },
    ]);
    // Editing works again.
    await editor.apply(root, HOME, { op: "setClass", id: ids.stack, add: ["gap-8"], remove: ["gap-6"] });
  });

  it("orphans a note when its element goes, and re-attaches it (T5.5)", async () => {
    const view = await loop.notes(root);
    const note = view.notes[1];
    write(HOME, read(HOME).replace(` data-ui-id="${ids.stack}"`, ' data-ui-id="ui_zzzzz"'));
    expect((await loop.notes(root)).notes[1]).toMatchObject({ orphaned: true, element: null });
    const fixed = await loop.writeNote(root, { op: "update", id: note?.id as string, target: "ui_zzzzz" });
    expect(fixed.notes[1]).toMatchObject({ orphaned: false, element: "Stack", target: "ui_zzzzz" });
  });

  it("reverts the pass to its handoff, keeping later work in history (T5.8)", async () => {
    const handoff = (await loop.status(root)).pass?.handoffCommit as string;
    const status = await loop.revert(root);
    expect(status).toMatchObject({ state: "with-user", pass: null, next: 2, summary: null });
    expect((await subjects()).slice(0, 3)).toEqual(["skeleton: revert pass #1", "skeleton: edits after pass #1", "agent: pass #1"]);
    expect((await git.diff(root, handoff, null)).files).toEqual([]);
    expect(existsSync(path.join(root, "src/hooks/use-orders.ts"))).toBe(false);
    await expect(loop.revert(root)).rejects.toThrow(/no pass to revert/);
  });

  it("hands off again as #2, measuring changes from the revert", async () => {
    const status = await loop.handoff(root);
    expect(status).toMatchObject({ state: "with-agent", handoff: { number: 2 } });
    expect(read("HANDOFF.md")).toContain("## Changes since last handoff\n- No changes.");
    // The status survives a new Loop (a restart): it's read from git.
    const fresh = new Loop({ io, git, editor, build: async () => build, setLocked: () => undefined });
    expect(await fresh.status(root)).toMatchObject({ state: "with-agent", handoff: { number: 2 }, next: 3 });
  });
});
