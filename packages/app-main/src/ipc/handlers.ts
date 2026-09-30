// Channel handlers. Plain async functions over injected I/O, so they are tested
// without Electron. `register.ts` wires them to ipcMain.

import path from "node:path";
import { buildTree, exportedNames, readRoutes, readTheme, sourceVersion, type TokenWrite } from "@skeleton/core";
import {
  ELEMENTS,
  GLOBALS_CSS,
  GRID_CLASSES,
  PALETTE,
  PALETTE_GROUPS,
  STACK_CLASSES,
  moduleFile,
  projectNameError,
  templateImports,
  templateTokens,
} from "@skeleton/templates";
import type { GitService } from "../git/service.js";
import { EditRefused, EditRolledBack, type Editor } from "../project/editor.js";
import {
  isChannel,
  type AppInfo,
  type Channel,
  type ChooseFolderRequest,
  type GitCommitRequest,
  type GitDiffRequest,
  type GitLogRequest,
  type GitRevertRequest,
  type DevServerStatus,
  type ProjectChanges,
  type ProjectInfo,
  type ProjectList,
  type RecentProject,
  type DevServerStatusRequest,
  type ProjectRootRequest,
  type IpcError,
  type IpcErrorCode,
  type IpcResult,
  type EditIntent,
  type NodeRef,
  type PageEditRequest,
  type PageIntent,
  type PageOpRequest,
  type PageTreeRequest,
  type ProjectCreateRequest,
  type ProjectCreateResponse,
  type TokenSheet,
  type TokenWriteRequest,
  type RequestOf,
  type ResponseOf,
} from "./contract.js";

export interface HandlerDeps {
  appInfo: () => AppInfo;
  readFile: (absolutePath: string) => Promise<string>;
  /** Creates a project on disk (scaffold, install, initial commit). */
  createProject: (request: ProjectCreateRequest) => Promise<ProjectCreateResponse>;
  devServer: {
    start: (projectRoot: string) => Promise<DevServerStatus>;
    stop: (projectRoot: string) => Promise<DevServerStatus>;
    status: (projectRoot: string, sinceSeq: number) => DevServerStatus;
  };
  projects: {
    list: () => Promise<ProjectList>;
    /** The project's info, or null if the folder isn't a Skeleton project. */
    info: (projectRoot: string) => Promise<ProjectInfo | null>;
    touch: (project: ProjectInfo) => Promise<void>;
    forget: (projectRoot: string) => Promise<RecentProject[]>;
  };
  chooseFolder: (request: ChooseFolderRequest) => Promise<string | null>;
  changes: (projectRoot: string) => ProjectChanges;
  git: Pick<GitService, "status" | "commit" | "log" | "diff" | "revert">;
  editor: Pick<Editor, "apply" | "page" | "undo" | "redo" | "history" | "tokens">;
  /** A project was opened or created: get ready to edit it (starts the typechecker warming up). */
  opened?: (projectRoot: string) => void;
}

const REV = /^([0-9a-f]{4,40}|HEAD)$/i;

function revOf(value: unknown, field: string): string {
  if (typeof value !== "string" || !REV.test(value)) {
    throw new HandlerError("bad-request", `${field} must be a commit hash`);
  }
  return value;
}

function projectRootOf(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) throw new HandlerError("bad-request", "expects { projectRoot }");
  const { projectRoot } = raw as Record<string, unknown>;
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) {
    throw new HandlerError("bad-request", "projectRoot must be an absolute path");
  }
  return path.resolve(projectRoot);
}

/** Thrown inside a handler to answer with a specific error code. */
export class HandlerError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HandlerError";
  }
}

type Validators = { [C in Channel]: (raw: unknown) => RequestOf<C> };
type Handlers = {
  [C in Channel]: (request: RequestOf<C>) => Promise<ResponseOf<C>>;
};

const PAGE_EXTENSIONS = new Set([".tsx", ".jsx"]);

const validators: Validators = {
  "app:info": (raw) => {
    if (raw !== null) throw new HandlerError("bad-request", "expects null");
    return null;
  },
  "page:source": (raw): PageTreeRequest => validators["page:tree"](raw),
  "page:edit": (raw): PageEditRequest => {
    const { projectRoot, file } = validators["page:tree"](raw);
    return { projectRoot, file, edit: editIntentOf((raw as Record<string, unknown>)["edit"]) };
  },
  "page:tree": (raw): PageTreeRequest => {
    if (typeof raw !== "object" || raw === null) {
      throw new HandlerError("bad-request", "expects { projectRoot, file }");
    }
    const { projectRoot, file } = raw as Record<string, unknown>;
    if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) {
      throw new HandlerError(
        "bad-request",
        "projectRoot must be an absolute path",
      );
    }
    if (typeof file !== "string" || file === "" || path.isAbsolute(file)) {
      throw new HandlerError(
        "bad-request",
        "file must be a path relative to projectRoot",
      );
    }
    if (!PAGE_EXTENSIONS.has(path.extname(file))) {
      throw new HandlerError(
        "bad-request",
        `file must be a .tsx or .jsx page, got ${file}`,
      );
    }
    return { projectRoot, file };
  },
  "project:create": (raw): ProjectCreateRequest => {
    if (typeof raw !== "object" || raw === null) {
      throw new HandlerError("bad-request", "expects { parentDir, name }");
    }
    const { parentDir, name } = raw as Record<string, unknown>;
    if (typeof parentDir !== "string" || !path.isAbsolute(parentDir)) {
      throw new HandlerError("bad-request", "parentDir must be an absolute path");
    }
    if (typeof name !== "string") throw new HandlerError("bad-request", "name must be a string");
    const nameError = projectNameError(name);
    if (nameError) throw new HandlerError("bad-request", nameError);
    return { parentDir, name };
  },
  "project:list": (raw) => {
    if (raw !== null) throw new HandlerError("bad-request", "expects null");
    return null;
  },
  "project:open": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "project:forget": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "dialog:chooseFolder": (raw): ChooseFolderRequest => {
    if (typeof raw !== "object" || raw === null) throw new HandlerError("bad-request", "expects { title }");
    const { title, defaultPath } = raw as Record<string, unknown>;
    if (typeof title !== "string" || title.length > 200) throw new HandlerError("bad-request", "title must be a short string");
    if (defaultPath !== undefined && (typeof defaultPath !== "string" || !path.isAbsolute(defaultPath))) {
      throw new HandlerError("bad-request", "defaultPath must be an absolute path");
    }
    return defaultPath === undefined ? { title } : { title, defaultPath };
  },
  "edit:undo": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "edit:redo": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "edit:history": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "project:page": (raw): PageOpRequest => ({ projectRoot: projectRootOf(raw), page: pageIntentOf((raw as Record<string, unknown>)["page"]) }),
  "palette:list": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "tokens:read": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "tokens:write": (raw): TokenWriteRequest => {
    const projectRoot = projectRootOf(raw);
    const writes = (raw as Record<string, unknown>)["writes"];
    if (!Array.isArray(writes) || writes.length === 0 || writes.length > 50) {
      throw new HandlerError("bad-request", "writes must be a list of 1 to 50 token writes");
    }
    return { projectRoot, writes: writes.map(tokenWriteOf) };
  },
  "project:pages": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "project:changes": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "git:status": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "git:commit": (raw): GitCommitRequest => {
    const projectRoot = projectRootOf(raw);
    const { message } = raw as Record<string, unknown>;
    if (typeof message !== "string" || message.trim() === "" || message.length > 10_000) {
      throw new HandlerError("bad-request", "message must be a non-empty string");
    }
    return { projectRoot, message };
  },
  "git:log": (raw): GitLogRequest => {
    const projectRoot = projectRootOf(raw);
    const { limit } = raw as Record<string, unknown>;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new HandlerError("bad-request", "limit must be an integer from 1 to 1000");
    }
    return { projectRoot, limit };
  },
  "git:diff": (raw): GitDiffRequest => {
    const projectRoot = projectRootOf(raw);
    const { from, to } = raw as Record<string, unknown>;
    return { projectRoot, from: revOf(from, "from"), to: to === null ? null : revOf(to, "to") };
  },
  "git:revert": (raw): GitRevertRequest => {
    const projectRoot = projectRootOf(raw);
    return { projectRoot, commit: revOf((raw as Record<string, unknown>)["commit"], "commit") };
  },
  "devserver:start": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "devserver:stop": (raw): ProjectRootRequest => ({ projectRoot: projectRootOf(raw) }),
  "devserver:status": (raw): DevServerStatusRequest => {
    const projectRoot = projectRootOf(raw);
    const { sinceSeq } = raw as Record<string, unknown>;
    if (typeof sinceSeq !== "number" || !Number.isInteger(sinceSeq) || sinceSeq < 0) {
      throw new HandlerError("bad-request", "sinceSeq must be a non-negative integer");
    }
    return { projectRoot, sinceSeq };
  },
};

const UI_ID = /^ui_[a-z0-9]{5}$/;

function idOf(obj: Record<string, unknown>, label: string, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !UI_ID.test(v)) throw new HandlerError("bad-request", `edit.${label} must be a data-ui-id`);
  return v;
}

function pageIntentOf(raw: unknown): PageIntent {
  if (typeof raw !== "object" || raw === null) throw new HandlerError("bad-request", "page must be an object");
  const p = raw as Record<string, unknown>;
  const str = (key: string, max = 200): string => {
    const v = p[key];
    if (typeof v !== "string" || v === "" || v.length > max) throw new HandlerError("bad-request", `page.${key} must be a non-empty string`);
    return v;
  };
  const optional = (key: string): string | null => (p[key] === null || p[key] === undefined ? null : str(key));
  switch (p["op"]) {
    case "addPage":
      return { op: "addPage", name: str("name"), path: str("path") };
    case "renamePage": {
      const name = optional("name");
      const newPath = optional("newPath");
      if (name === null && newPath === null) throw new HandlerError("bad-request", "renamePage needs a new name or a new path");
      return { op: "renamePage", path: str("path"), name, newPath };
    }
    case "deletePage":
      return { op: "deletePage", path: str("path") };
    default:
      throw new HandlerError("bad-request", `unknown page op ${JSON.stringify(p["op"])}`);
  }
}

/** A token value: one line of CSS, nothing that could end the declaration or open a comment. */
const TOKEN_VALUE = /^[^;{}\n\r]{1,200}$/;

function tokenWriteOf(raw: unknown): TokenWrite {
  if (typeof raw !== "object" || raw === null) throw new HandlerError("bad-request", "each write must be an object");
  const { name, value, mode } = raw as Record<string, unknown>;
  if (typeof name !== "string" || !/^--[a-z][a-z0-9-]{0,63}$/.test(name)) throw new HandlerError("bad-request", "write.name must be a token name like --radius");
  if (typeof value !== "string" || !TOKEN_VALUE.test(value) || value.trim() === "" || value.includes("/*")) {
    throw new HandlerError("bad-request", `write.value for ${name} must be one CSS value`);
  }
  if (mode !== null && mode !== "light" && mode !== "dark") throw new HandlerError("bad-request", "write.mode must be light, dark or null");
  return { name, value: value.trim(), mode };
}

function classesOf(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 20 || !value.every((c) => typeof c === "string" && /^\S{1,100}$/.test(c))) {
    throw new HandlerError("bad-request", `edit.${label} must be a list of class names`);
  }
  return value as string[];
}

function nodeRefOf(ref: unknown): NodeRef {
  if (typeof ref !== "object" || ref === null) throw new HandlerError("bad-request", "edit.ref must be an object");
  const r = ref as Record<string, unknown>;
  return "id" in r ? { id: idOf(r, "ref.id", "id") } : { parentId: idOf(r, "ref.parentId", "parentId"), index: indexOf(r, "ref.index", "index") };
}

function indexOf(obj: Record<string, unknown>, label: string, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10_000) {
    throw new HandlerError("bad-request", `edit.${label} must be a non-negative integer`);
  }
  return v;
}

function editIntentOf(raw: unknown): EditIntent {
  if (typeof raw !== "object" || raw === null) throw new HandlerError("bad-request", "edit must be an object");
  const e = raw as Record<string, unknown>;
  const id = (key: string): string => idOf(e, key, key);
  const index = (key: string): number => indexOf(e, key, key);
  switch (e["op"]) {
    case "insert": {
      const paletteId = e["paletteId"];
      if (typeof paletteId !== "string" || !PALETTE.some((p) => p.id === paletteId && p.template !== null)) {
        throw new HandlerError("bad-request", "edit.paletteId must name a placeable palette entry");
      }
      return { op: "insert", parentId: id("parentId"), index: index("index"), paletteId };
    }
    case "move":
      return { op: "move", ref: nodeRefOf(e["ref"]), newParentId: id("newParentId"), index: index("index") };
    case "remove": {
      if (typeof e["allowLocked"] !== "boolean") throw new HandlerError("bad-request", "edit.allowLocked must be a boolean");
      return { op: "remove", ref: nodeRefOf(e["ref"]), allowLocked: e["allowLocked"] };
    }
    case "setProp": {
      const key = e["key"];
      const value = e["value"];
      if (typeof key !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(key)) throw new HandlerError("bad-request", "edit.key must be a prop name");
      const literal = value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
      if (!literal && !(typeof value === "string" && value.length <= 10_000)) {
        throw new HandlerError("bad-request", "edit.value must be a string, finite number, boolean or null");
      }
      return { op: "setProp", id: id("id"), key, value: value as string | number | boolean | null };
    }
    case "setText": {
      const text = e["text"];
      if (typeof text !== "string" || text.length > 10_000) throw new HandlerError("bad-request", "edit.text must be a string of at most 10,000 characters");
      return { op: "setText", id: id("id"), text };
    }
    case "setClass":
      return { op: "setClass", id: id("id"), add: classesOf(e["add"], "add"), remove: classesOf(e["remove"], "remove") };
    default:
      throw new HandlerError("bad-request", `unknown edit op ${JSON.stringify(e["op"])}`);
  }
}

/** Resolves `file` inside `root`, refusing anything that escapes it. */
export function resolveInside(root: string, file: string): string {
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new HandlerError(
      "bad-request",
      `${file} is outside the project root`,
    );
  }
  return resolved;
}

function createHandlers(deps: HandlerDeps): Handlers {
  const readPage = async (projectRoot: string, file: string): Promise<string> => {
    const absolute = resolveInside(projectRoot, file);
    try {
      return await deps.readFile(absolute);
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        throw new HandlerError("not-found", `no such page: ${file}`);
      }
      throw err;
    }
  };
  const exists = (projectRoot: string, file: string): Promise<boolean> =>
    deps.readFile(resolveInside(projectRoot, file)).then(
      () => true,
      (err: unknown) => {
        if (isNodeError(err) && err.code === "ENOENT") return false;
        throw err;
      },
    );
  return {
    "app:info": async () => deps.appInfo(),
    "edit:undo": async ({ projectRoot }) => editing(() => deps.editor.undo(projectRoot)),
    "edit:redo": async ({ projectRoot }) => editing(() => deps.editor.redo(projectRoot)),
    "edit:history": async ({ projectRoot }) => deps.editor.history(projectRoot),
    "project:page": async ({ projectRoot, page }) => {
      return editing(() => deps.editor.page(projectRoot, page));
    },
    "palette:list": async ({ projectRoot }) => {
      // A component is available when its module exists and exports it.
      const exportsOf = new Map<string, Promise<string[]>>();
      const moduleExports = (from: string): Promise<string[]> => {
        let names = exportsOf.get(from);
        if (!names) {
          const file = moduleFile(from);
          names = deps.readFile(resolveInside(projectRoot, file)).then(
            (source) => {
              try {
                return exportedNames(source);
              } catch (cause) {
                throw new HandlerError("failed", `${file} doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}`);
              }
            },
            (err: unknown) => {
              if (isNodeError(err) && err.code === "ENOENT") return [];
              throw err;
            },
          );
          exportsOf.set(from, names);
        }
        return names;
      };
      const items = await Promise.all(
        PALETTE.map(async (item) => {
          const imports = item.template ? templateImports(item.template) : [];
          const missing: string[] = [];
          for (const { name, from } of imports) {
            if (!(await moduleExports(from)).includes(name)) missing.push(`${name} (${moduleFile(from)})`);
          }
          return { ...item, available: item.template !== null && missing.length === 0, missing };
        }),
      );
      return { groups: [...PALETTE_GROUPS], items, elements: { ...ELEMENTS }, layout: { stack: [...STACK_CLASSES], grid: [...GRID_CLASSES] } };
    },
    "tokens:read": async ({ projectRoot }) => {
      let css: string;
      try {
        css = await deps.readFile(resolveInside(projectRoot, GLOBALS_CSS));
      } catch (err) {
        if (isNodeError(err) && err.code === "ENOENT") throw new HandlerError("not-found", `${GLOBALS_CSS} not found`);
        throw err;
      }
      return sheetOf(css);
    },
    "tokens:write": async ({ projectRoot, writes }) => {
      const { css } = await editing(() => deps.editor.tokens(projectRoot, writes));
      return { sheet: sheetOf(css), history: await deps.editor.history(projectRoot) };
    },
    "page:source": async ({ projectRoot, file }) => readPage(projectRoot, file),
    "page:edit": async ({ projectRoot, file, edit }) => {
      await readPage(projectRoot, file); // inside the project, and exists
      return editing(() => deps.editor.apply(projectRoot, file, edit));
    },
    "project:changes": async ({ projectRoot }) => deps.changes(projectRoot),
    "project:pages": async ({ projectRoot }) => {
      const routerFile = "src/router.tsx";
      let source: string;
      try {
        source = await deps.readFile(resolveInside(projectRoot, routerFile));
      } catch (err) {
        if (isNodeError(err) && err.code === "ENOENT") return { routerFile, pages: [], error: `${routerFile} not found` };
        throw err;
      }
      let result: ReturnType<typeof readRoutes>;
      try {
        result = readRoutes(source, routerFile);
      } catch (cause) {
        return { routerFile, pages: [], error: `${routerFile} doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}` };
      }
      const pages = await Promise.all(
        result.routes.map(async (route) => {
          if (!route.file) return { ...route, exists: false };
          return { ...route, exists: await exists(projectRoot, route.file) };
        }),
      );
      return { routerFile, pages, error: result.error };
    },
    "page:tree": async ({ projectRoot, file }) => {
      const source = await readPage(projectRoot, file);
      return { ...buildTree(source), version: sourceVersion(source) };
    },
    "project:create": async (request) => {
      const created = await deps.createProject(request);
      await deps.projects.touch({ projectRoot: created.projectRoot, name: request.name });
      deps.opened?.(created.projectRoot);
      return created;
    },
    "project:list": async () => deps.projects.list(),
    "project:open": async ({ projectRoot }) => {
      const info = await deps.projects.info(projectRoot);
      if (!info) throw new HandlerError("not-found", `${projectRoot} isn't a Skeleton project (no skeleton/config.json)`);
      await deps.projects.touch(info);
      deps.opened?.(projectRoot);
      return info;
    },
    "project:forget": async ({ projectRoot }) => deps.projects.forget(projectRoot),
    "dialog:chooseFolder": async (request) => deps.chooseFolder(request),
    "git:status": async ({ projectRoot }) => deps.git.status(projectRoot),
    "git:commit": async ({ projectRoot, message }) => deps.git.commit(projectRoot, message),
    "git:log": async ({ projectRoot, limit }) => deps.git.log(projectRoot, limit),
    "git:diff": async ({ projectRoot, from, to }) => deps.git.diff(projectRoot, from, to),
    "git:revert": async ({ projectRoot, commit }) => deps.git.revert(projectRoot, commit),
    "devserver:start": async ({ projectRoot }) => deps.devServer.start(projectRoot),
    "devserver:stop": async ({ projectRoot }) => deps.devServer.stop(projectRoot),
    "devserver:status": async ({ projectRoot, sinceSeq }) => deps.devServer.status(projectRoot, sinceSeq),
  };
}

function sheetOf(css: string): TokenSheet {
  try {
    return { file: GLOBALS_CSS, ...readTheme(css, templateTokens()) };
  } catch (cause) {
    throw new HandlerError("failed", `${GLOBALS_CSS} doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** Runs an editor call, turning its refusals and rollbacks into IPC errors. */
async function editing<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (cause) {
    if (cause instanceof EditRefused) throw new HandlerError("edit-refused", cause.message);
    if (cause instanceof EditRolledBack) throw new HandlerError("edit-rolled-back", cause.message);
    throw cause;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export type Dispatch = (
  channel: unknown,
  request: unknown,
) => Promise<IpcResult<unknown>>;

/**
 * Validates the channel and request, runs the handler and turns any failure into an
 * `IpcError` naming the channel. Unexpected errors are reported through `onError`,
 * never swallowed.
 */
export function createDispatch(
  deps: HandlerDeps,
  onError: (error: IpcError, cause: unknown) => void,
): Dispatch {
  const handlers = createHandlers(deps);
  return async (channel, request) => {
    if (!isChannel(channel)) {
      const error: IpcError = {
        code: "bad-request",
        channel: String(channel),
        message: "unknown channel",
      };
      onError(error, null);
      return { ok: false, error };
    }
    try {
      return { ok: true, value: await run(handlers, channel, request) };
    } catch (cause) {
      const error: IpcError =
        cause instanceof HandlerError
          ? { code: cause.code, channel, message: cause.message }
          : {
              code: "failed",
              channel,
              message: cause instanceof Error ? cause.message : String(cause),
            };
      onError(error, cause);
      return { ok: false, error };
    }
  };
}

async function run<C extends Channel>(
  handlers: Handlers,
  channel: C,
  raw: unknown,
): Promise<ResponseOf<C>> {
  const request = validators[channel](raw);
  return handlers[channel](request);
}
