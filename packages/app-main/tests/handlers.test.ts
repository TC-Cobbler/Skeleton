import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { IpcError } from "../src/ipc/contract.js";
import {
  createDispatch,
  resolveInside,
  type HandlerDeps,
} from "../src/ipc/handlers.js";

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
