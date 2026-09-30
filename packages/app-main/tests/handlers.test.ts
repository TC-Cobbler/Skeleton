import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { sourceVersion } from "@skeleton/core";
import type { IpcError } from "../src/ipc/contract.js";
import {
  createDispatch,
  resolveInside,
  type HandlerDeps,
} from "../src/ipc/handlers.js";
import { EditRefused } from "../src/project/editor.js";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/base",
);

const appInfo = {
  appVersion: "0.0.0",
  electron: "1",
  chrome: "2",
  node: "3",
  platform: "linux",
};

const stoppedStatus = (projectRoot: string) => ({
  projectRoot,
  state: "stopped" as const,
  url: null,
  port: null,
  lastError: null,
  starts: 0,
  logs: [],
  lastSeq: 0,
});

function setup(overrides: Partial<HandlerDeps> = {}) {
  const errors: IpcError[] = [];
  const dispatch = createDispatch(
    {
      appInfo: () => appInfo,
      readFile: (p) => readFile(p, "utf8"),
      createProject: async (req) => ({
        projectRoot: path.join(req.parentDir, "stub"),
        commit: "abc123",
        timings: { write: 1, install: 2, git: 3 },
      }),
      devServer: {
        start: async (projectRoot) => ({ ...stoppedStatus(projectRoot), state: "starting" }),
        stop: async (projectRoot) => stoppedStatus(projectRoot),
        status: (projectRoot, sinceSeq) => ({ ...stoppedStatus(projectRoot), lastSeq: sinceSeq }),
      },
      projects: {
        list: async () => ({ recent: [], defaultParentDir: "/home/u/Documents/Skeleton" }),
        info: async (projectRoot) => (projectRoot === fixtureRoot ? { projectRoot, name: "Fixture" } : null),
        touch: async () => undefined,
        forget: async () => [],
      },
      chooseFolder: async () => "/chosen",
      changes: () => ({ revision: 3, locked: false, changed: ["src/pages/HomePage.tsx"], error: null }),
      git: {
        status: async () => ({ head: "h", clean: true, changed: [] }),
        commit: async (_root, message) => ({ hash: "c0ffee", subject: message, time: 1 }),
        log: async () => [],
        diff: async (_root, from, to) => ({ from, to, files: [] }),
        revert: async (_root, commit) => ({ hash: "abc", subject: `skeleton: revert to ${commit}`, time: 1 }),
      },
      editor: {
        apply: async (_root, file, edit) => {
          if (edit.op === "insert" && edit.parentId === "ui_lockd") throw new EditRefused("insert(ui_lockd): ui_lockd is a locked block");
          return { file, select: "ui_new01", patch: "", linesAdded: 1, linesRemoved: 0 };
        },
      },
      ...overrides,
    },
    (error) => errors.push(error),
  );
  return { dispatch, errors };
}

describe("dispatch", () => {
  it("answers app:info", async () => {
    const { dispatch } = setup();
    await expect(dispatch("app:info", null)).resolves.toEqual({
      ok: true,
      value: appInfo,
    });
  });

  it("parses a page file through core", async () => {
    const { dispatch } = setup();
    const result = await dispatch("page:tree", {
      projectRoot: fixtureRoot,
      file: "src/pages/HomePage.tsx",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const source = await readFile(path.join(fixtureRoot, "src/pages/HomePage.tsx"), "utf8");
    expect((result.value as { version: string }).version).toBe(sourceVersion(source));
    const tree = result.value as {
      roots: { id: string | null }[];
      rootError: string | null;
    };
    expect(tree.rootError).toBeNull();
    expect(tree.roots.length).toBeGreaterThan(0);
    // The result crosses IPC by structured clone, so it must be plain data.
    expect(structuredClone(tree)).toEqual(tree);
  });

  it("refuses an unknown channel and reports it", async () => {
    const { dispatch, errors } = setup();
    const result = await dispatch("fs:writeFile", { path: "/etc/passwd" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "bad-request",
        channel: "fs:writeFile",
        message: "unknown channel",
      },
    });
    expect(errors).toHaveLength(1);
  });

  it.each([
    ["a missing request", undefined, "expects { projectRoot, file }"],
    [
      "a relative root",
      { projectRoot: "fixtures/base", file: "src/pages/HomePage.tsx" },
      "projectRoot must be an absolute path",
    ],
    [
      "an absolute file",
      { projectRoot: fixtureRoot, file: "/etc/hosts.tsx" },
      "file must be a path relative to projectRoot",
    ],
    [
      "a non-page file",
      { projectRoot: fixtureRoot, file: "package.json" },
      "file must be a .tsx or .jsx page, got package.json",
    ],
    [
      "a path escaping the root",
      { projectRoot: fixtureRoot, file: "../../packages/x.tsx" },
      "../../packages/x.tsx is outside the project root",
    ],
  ])("refuses %s", async (_label, request, message) => {
    const { dispatch } = setup();
    await expect(dispatch("page:tree", request)).resolves.toEqual({
      ok: false,
      error: { code: "bad-request", channel: "page:tree", message },
    });
  });

  it("answers not-found for a missing page without reading outside the root", async () => {
    const readFileSpy = vi.fn(async (p: string) => readFile(p, "utf8"));
    const { dispatch } = setup({ readFile: readFileSpy });
    const result = await dispatch("page:tree", {
      projectRoot: fixtureRoot,
      file: "src/pages/Nope.tsx",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "not-found",
        channel: "page:tree",
        message: "no such page: src/pages/Nope.tsx",
      },
    });
    expect(readFileSpy).toHaveBeenCalledWith(
      path.join(fixtureRoot, "src/pages/Nope.tsx"),
    );
  });

  it("reports a parse failure naming the channel", async () => {
    const { dispatch, errors } = setup({
      readFile: async () => "export default function P() { return <div> }",
    });
    const result = await dispatch("page:tree", {
      projectRoot: fixtureRoot,
      file: "src/pages/Broken.tsx",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("failed");
    expect(result.error.channel).toBe("page:tree");
    expect(errors).toEqual([result.error]);
  });
});

describe("resolveInside", () => {
  it("resolves a nested path", () => {
    expect(resolveInside("/p", "src/a.tsx")).toBe(path.resolve("/p/src/a.tsx"));
  });

  it.each(["..", "../p2/a.tsx", "src/../../a.tsx", "."])(
    "refuses %s",
    (file) => {
      expect(() => resolveInside("/p", file)).toThrow(
        /outside the project root/,
      );
    },
  );
});

describe("project:create", () => {
  it("validates the request before touching disk", async () => {
    const createProject = vi.fn();
    const { dispatch, errors } = setup({ createProject });
    const bad = [
      null,
      { parentDir: "relative/dir", name: "App" },
      { parentDir: "/tmp", name: 42 },
      { parentDir: "/tmp", name: "<script>" },
      { parentDir: "/tmp", name: " App" },
    ];
    for (const request of bad) {
      const result = await dispatch("project:create", request);
      expect(result.ok, JSON.stringify(request)).toBe(false);
    }
    expect(createProject).not.toHaveBeenCalled();
    expect(errors.every((e) => e.code === "bad-request" && e.channel === "project:create")).toBe(true);
  });

  it("delegates a valid request to the scaffolder", async () => {
    const { dispatch } = setup();
    await expect(dispatch("project:create", { parentDir: "/tmp", name: "Gaming Library" })).resolves.toEqual({
      ok: true,
      value: { projectRoot: "/tmp/stub", commit: "abc123", timings: { write: 1, install: 2, git: 3 } },
    });
  });

  it("reports scaffolder failures as failed, naming the channel", async () => {
    const { dispatch, errors } = setup({
      createProject: async () => {
        throw new Error("scaffold failed at install: offline");
      },
    });
    const result = await dispatch("project:create", { parentDir: "/tmp", name: "App" });
    expect(result).toEqual({
      ok: false,
      error: { code: "failed", channel: "project:create", message: "scaffold failed at install: offline" },
    });
    expect(errors).toHaveLength(1);
  });
});

describe("devserver channels", () => {
  it("validates projectRoot and sinceSeq", async () => {
    const { dispatch } = setup();
    for (const [channel, request] of [
      ["devserver:start", { projectRoot: "rel" }],
      ["devserver:stop", null],
      ["devserver:status", { projectRoot: "/p", sinceSeq: -1 }],
      ["devserver:status", { projectRoot: "/p" }],
    ] as const) {
      const result = await dispatch(channel, request);
      expect(result.ok, `${channel} ${JSON.stringify(request)}`).toBe(false);
    }
  });

  it("passes normalised requests to the manager", async () => {
    const { dispatch } = setup();
    await expect(dispatch("devserver:start", { projectRoot: "/p/./x/" })).resolves.toMatchObject({
      ok: true,
      value: { projectRoot: "/p/x", state: "starting" },
    });
    await expect(dispatch("devserver:status", { projectRoot: "/p", sinceSeq: 7 })).resolves.toMatchObject({
      ok: true,
      value: { lastSeq: 7 },
    });
  });
});

describe("project picker channels", () => {
  const projects = () => {
    const touched: string[] = [];
    return {
      touched,
      deps: {
        list: async () => ({ recent: [], defaultParentDir: "/d" }),
        info: async (projectRoot: string) => (projectRoot === fixtureRoot ? { projectRoot, name: "Fixture" } : null),
        touch: async (p: { projectRoot: string }) => {
          touched.push(p.projectRoot);
        },
        forget: async () => [],
      },
    };
  };

  it("opens a Skeleton project and records it as recent", async () => {
    const p = projects();
    const { dispatch } = setup({ projects: p.deps });
    await expect(dispatch("project:open", { projectRoot: fixtureRoot })).resolves.toEqual({
      ok: true,
      value: { projectRoot: fixtureRoot, name: "Fixture" },
    });
    expect(p.touched).toEqual([fixtureRoot]);
  });

  it("refuses a folder that isn't a Skeleton project, without recording it", async () => {
    const p = projects();
    const { dispatch } = setup({ projects: p.deps });
    const result = await dispatch("project:open", { projectRoot: "/somewhere/else" });
    expect(result).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(p.touched).toEqual([]);
  });

  it("records a newly created project as recent", async () => {
    const p = projects();
    const { dispatch } = setup({ projects: p.deps });
    await dispatch("project:create", { parentDir: "/tmp", name: "App" });
    expect(p.touched).toEqual(["/tmp/stub"]);
  });

  it("validates folder-dialog requests", async () => {
    const { dispatch } = setup();
    await expect(dispatch("dialog:chooseFolder", { title: "Pick" })).resolves.toEqual({ ok: true, value: "/chosen" });
    expect((await dispatch("dialog:chooseFolder", { title: "Pick", defaultPath: "rel" })).ok).toBe(false);
    expect((await dispatch("dialog:chooseFolder", null)).ok).toBe(false);
    expect((await dispatch("project:list", {})).ok).toBe(false);
  });
});

describe("git channels", () => {
  it("validates requests", async () => {
    const { dispatch } = setup();
    const bad: [string, unknown][] = [
      ["git:commit", { projectRoot: "/p", message: "  " }],
      ["git:log", { projectRoot: "/p", limit: 0 }],
      ["git:diff", { projectRoot: "/p", from: "main; rm -rf /", to: null }],
      ["git:diff", { projectRoot: "/p", from: "abc1", to: "--output=/tmp/x" }],
      ["git:revert", { projectRoot: "/p", commit: "HEAD~1" }],
      ["git:status", { projectRoot: "p" }],
    ];
    for (const [channel, request] of bad) {
      expect((await dispatch(channel, request)).ok, `${channel} ${JSON.stringify(request)}`).toBe(false);
    }
  });

  it("passes valid requests through", async () => {
    const { dispatch } = setup();
    await expect(dispatch("git:diff", { projectRoot: "/p", from: "abc1", to: null })).resolves.toEqual({
      ok: true,
      value: { from: "abc1", to: null, files: [] },
    });
    await expect(dispatch("git:commit", { projectRoot: "/p", message: "skeleton: handoff #1" })).resolves.toMatchObject({
      ok: true,
      value: { subject: "skeleton: handoff #1" },
    });
  });
});

describe("project:pages", () => {
  it("lists the fixture's routes with their page files", async () => {
    const { dispatch } = setup();
    await expect(dispatch("project:pages", { projectRoot: fixtureRoot })).resolves.toEqual({
      ok: true,
      value: {
        routerFile: "src/router.tsx",
        pages: [{ path: "/", component: "HomePage", file: "src/pages/HomePage.tsx", dynamic: false, exists: true }],
        error: null,
      },
    });
  });

  it("reports a missing router instead of failing", async () => {
    const { dispatch } = setup();
    const result = await dispatch("project:pages", { projectRoot: path.join(fixtureRoot, "src") });
    expect(result).toMatchObject({ ok: true, value: { pages: [], error: "src/router.tsx not found" } });
  });
});

describe("palette:list", () => {
  it("marks entries the project can't place, naming what's missing", async () => {
    const { dispatch } = setup();
    const result = await dispatch("palette:list", { projectRoot: fixtureRoot });
    if (!result.ok) throw new Error(result.error.message);
    const palette = result.value as import("../src/ipc/contract.js").Palette;
    const byId = new Map(palette.items.map((i) => [i.id, i]));
    expect(byId.get("button")).toMatchObject({ available: true, missing: [] });
    expect(byId.get("stack-vertical")).toMatchObject({ available: true, missing: [] });
    expect(byId.get("card")).toMatchObject({ available: true, missing: [] });
    // The base fixture's layout index exports only Stack, and it has no Select.
    expect(byId.get("grid")).toMatchObject({ available: false, missing: ["Grid (src/components/layout/index.ts)"] });
    expect(byId.get("select")?.available).toBe(false);
    expect(byId.get("select")?.missing).toContain("Select (src/components/ui/select.tsx)");
    expect(byId.get("toast")).toMatchObject({ available: false, template: null, missing: [] });
    expect(palette.groups.map((g) => g.id)).toEqual(["layout", "inputs", "display", "overlay", "navigation"]);
    expect(palette.elements["Button"]?.props.map((p) => p.name)).toEqual(["variant", "size", "type", "disabled"]);
  });

  it("rejects a relative project root", async () => {
    const { dispatch } = setup();
    await expect(dispatch("palette:list", { projectRoot: "fixtures/base" })).resolves.toMatchObject({ ok: false, error: { code: "bad-request" } });
  });
});

describe("page:edit", () => {
  const request = (edit: unknown, file = "src/pages/HomePage.tsx") => ({ projectRoot: fixtureRoot, file, edit });

  it("passes a valid insert to the editor", async () => {
    const { dispatch } = setup();
    await expect(dispatch("page:edit", request({ op: "insert", parentId: "ui_abcde", index: 0, paletteId: "button" }))).resolves.toMatchObject({
      ok: true,
      value: { file: "src/pages/HomePage.tsx", select: "ui_new01" },
    });
  });

  it("passes a valid move, by ID or by position, to the editor", async () => {
    const edits: unknown[] = [];
    const { dispatch } = setup({
      editor: {
        apply: async (_root, file, edit) => {
          edits.push(edit);
          return { file, select: null, patch: "", linesAdded: 0, linesRemoved: 0 };
        },
      },
    });
    for (const ref of [{ id: "ui_abcde" }, { parentId: "ui_fghij", index: 2 }]) {
      await expect(dispatch("page:edit", request({ op: "move", ref, newParentId: "ui_klmno", index: 1 }))).resolves.toMatchObject({ ok: true });
    }
    expect(edits).toEqual([
      { op: "move", ref: { id: "ui_abcde" }, newParentId: "ui_klmno", index: 1 },
      { op: "move", ref: { parentId: "ui_fghij", index: 2 }, newParentId: "ui_klmno", index: 1 },
    ]);
  });

  it("passes valid property edits to the editor", async () => {
    const edits: unknown[] = [];
    const { dispatch } = setup({
      editor: {
        apply: async (_root, file, edit) => {
          edits.push(edit);
          return { file, select: null, patch: "", linesAdded: 0, linesRemoved: 0 };
        },
      },
    });
    const valid = [
      { op: "setProp", id: "ui_abcde", key: "variant", value: "outline" },
      { op: "setProp", id: "ui_abcde", key: "disabled", value: true },
      { op: "setProp", id: "ui_abcde", key: "rows", value: 3 },
      { op: "setProp", id: "ui_abcde", key: "variant", value: null },
      { op: "setText", id: "ui_abcde", text: "Hello {world}" },
      { op: "setClass", id: "ui_abcde", add: ["gap-6"], remove: ["gap-4"] },
    ];
    for (const edit of valid) await expect(dispatch("page:edit", request(edit)), JSON.stringify(edit)).resolves.toMatchObject({ ok: true });
    expect(edits).toEqual(valid);
  });

  it("rejects malformed intents before any edit", async () => {
    const { dispatch } = setup();
    for (const edit of [
      null,
      { op: "reformat" },
      { op: "insert", parentId: "abc", index: 0, paletteId: "button" },
      { op: "insert", parentId: "ui_abcde", index: -1, paletteId: "button" },
      { op: "insert", parentId: "ui_abcde", index: 1.5, paletteId: "button" },
      { op: "insert", parentId: "ui_abcde", index: 0, paletteId: "toast" },
      { op: "insert", parentId: "ui_abcde", index: 0, paletteId: "<script>" },
      { op: "move", ref: null, newParentId: "ui_abcde", index: 0 },
      { op: "move", ref: { id: "nope" }, newParentId: "ui_abcde", index: 0 },
      { op: "move", ref: { parentId: "ui_abcde" }, newParentId: "ui_abcde", index: 0 },
      { op: "move", ref: { id: "ui_abcde" }, newParentId: "ui_abcde", index: "1" },
      { op: "remove", ref: { id: "ui_abcde" } },
      { op: "remove", ref: { id: "ui_abcde" }, allowLocked: "yes" },
      { op: "remove", ref: "ui_abcde", allowLocked: false },
      { op: "setProp", id: "ui_abcde", key: "on click", value: "x" },
      { op: "setProp", id: "ui_abcde", key: "variant", value: { x: 1 } },
      { op: "setProp", id: "ui_abcde", key: "rows", value: Number.NaN },
      { op: "setText", id: "ui_abcde", text: 5 },
      { op: "setText", id: "ui_abcde", text: "x".repeat(10_001) },
      { op: "setClass", id: "ui_abcde", add: ["gap-4 p-2"], remove: [] },
      { op: "setClass", id: "ui_abcde", add: "gap-4", remove: [] },
      { op: "setClass", id: "ui_abcde", add: [], remove: [1] },
    ]) {
      await expect(dispatch("page:edit", request(edit)), JSON.stringify(edit)).resolves.toMatchObject({ ok: false, error: { code: "bad-request" } });
    }
    await expect(dispatch("page:edit", request({ op: "insert", parentId: "ui_abcde", index: 0, paletteId: "button" }, "../x.tsx"))).resolves.toMatchObject({
      ok: false,
      error: { code: "bad-request" },
    });
  });

  it("reports a missing page as not-found and a refused op as edit-refused", async () => {
    const { dispatch } = setup();
    await expect(dispatch("page:edit", request({ op: "insert", parentId: "ui_abcde", index: 0, paletteId: "button" }, "src/pages/Nope.tsx"))).resolves.toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
    await expect(dispatch("page:edit", request({ op: "insert", parentId: "ui_lockd", index: 0, paletteId: "button" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "edit-refused", message: "insert(ui_lockd): ui_lockd is a locked block" },
    });
  });
});
