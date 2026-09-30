// Channel handlers. Plain async functions over injected I/O, so they are tested
// without Electron. `register.ts` wires them to ipcMain.

import path from "node:path";
import { buildTree } from "@skeleton/core";
import { projectNameError } from "@skeleton/templates";
import {
  isChannel,
  type AppInfo,
  type Channel,
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
    "project:create": async (request) => deps.createProject(request),
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
