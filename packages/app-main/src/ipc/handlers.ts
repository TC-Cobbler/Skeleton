// Channel handlers. Plain async functions over injected I/O, so they are tested
// without Electron. `register.ts` wires them to ipcMain.

import path from "node:path";
import { buildTree } from "@skeleton/core";
import { projectNameError } from "@skeleton/templates";
import {
  isChannel,
  type AppInfo,
  type Channel,
  type ChooseFolderRequest,
  type DevServerStatus,
  type ProjectInfo,
  type ProjectList,
  type RecentProject,
  type DevServerStatusRequest,
  type ProjectRootRequest,
  type IpcError,
  type IpcErrorCode,
  type IpcResult,
  type PageTreeRequest,
  type ProjectCreateRequest,
  type ProjectCreateResponse,
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
  return {
    "app:info": async () => deps.appInfo(),
    "page:tree": async ({ projectRoot, file }) => {
      const absolute = resolveInside(projectRoot, file);
      let source: string;
      try {
        source = await deps.readFile(absolute);
      } catch (err) {
        if (isNodeError(err) && err.code === "ENOENT") {
          throw new HandlerError("not-found", `no such page: ${file}`);
        }
        throw err;
      }
      return buildTree(source);
    },
    "project:create": async (request) => {
      const created = await deps.createProject(request);
      await deps.projects.touch({ projectRoot: created.projectRoot, name: request.name });
      return created;
    },
    "project:list": async () => deps.projects.list(),
    "project:open": async ({ projectRoot }) => {
      const info = await deps.projects.info(projectRoot);
      if (!info) throw new HandlerError("not-found", `${projectRoot} isn't a Skeleton project (no skeleton/config.json)`);
      await deps.projects.touch(info);
      return info;
    },
    "project:forget": async ({ projectRoot }) => deps.projects.forget(projectRoot),
    "dialog:chooseFolder": async (request) => deps.chooseFolder(request),
    "devserver:start": async ({ projectRoot }) => deps.devServer.start(projectRoot),
    "devserver:stop": async ({ projectRoot }) => deps.devServer.stop(projectRoot),
    "devserver:status": async ({ projectRoot, sinceSeq }) => deps.devServer.status(projectRoot, sinceSeq),
  };
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
