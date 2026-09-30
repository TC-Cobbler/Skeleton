// The IPC contract between the renderer (UI only) and the main process (filesystem,
// git, child processes, AST). This is the only module the renderer imports from
// app-main, and only for types. See docs/decisions/003-ipc-boundaries.md.

import type { PageTree } from "@skeleton/core";

export type { PageTree, UiNode, NodeKind } from "@skeleton/core";

export interface AppInfo {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

export interface PageTreeRequest {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Page file, relative to `projectRoot`, e.g. `src/pages/HomePage.tsx`. */
  file: string;
}

export interface ProjectCreateRequest {
  /** Absolute path of the folder to create the project in. */
  parentDir: string;
  /** Human project name, e.g. "Gaming Library"; the folder is its slug. */
  name: string;
}

export interface ProjectCreateResponse {
  projectRoot: string;
  /** Hash of the initial `skeleton: scaffold` commit. */
  commit: string;
  timings: { write: number; install: number; git: number };
}

export interface ProjectInfo {
  projectRoot: string;
  /** From `skeleton/config.json`. */
  name: string;
}

export interface RecentProject extends ProjectInfo {
  lastOpened: number;
  /** The folder or its Skeleton config no longer exists. */
  missing: boolean;
}

export interface ProjectList {
  recent: RecentProject[];
  /** Suggested folder for new projects. */
  defaultParentDir: string;
}

export interface ChooseFolderRequest {
  title: string;
  /** Show this folder first, if it exists. */
  defaultPath?: string;
}

export type DevServerState = "starting" | "running" | "installing" | "stopped" | "crashed" | "failed";

export interface LogLine {
  seq: number;
  time: number;
  stream: "stdout" | "stderr" | "skeleton";
  level: "info" | "error";
  text: string;
}

export interface DevServerStatus {
  projectRoot: string;
  state: DevServerState;
  /** Set once Vite reports it is listening. */
  url: string | null;
  port: number | null;
  /** Why the server is `crashed` or `failed`, or the latest error line while running. */
  lastError: string | null;
  /** How many times the process has been (re)started. */
  starts: number;
  /** Log lines with `seq > sinceSeq`, oldest first. */
  logs: LogLine[];
  /** The highest `seq` so far; pass it back as `sinceSeq` to get only new lines. */
  lastSeq: number;
}

export interface ProjectRootRequest {
  /** Absolute path to the project root. */
  projectRoot: string;
}

export interface DevServerStatusRequest extends ProjectRootRequest {
  /** Only return log lines after this sequence number (0 for all). */
  sinceSeq: number;
}

/** Every channel: what the renderer sends and what main answers with. */
export interface IpcContract {
  "app:info": { request: null; response: AppInfo };
  "page:tree": { request: PageTreeRequest; response: PageTree };
  "project:create": { request: ProjectCreateRequest; response: ProjectCreateResponse };
  "devserver:start": { request: ProjectRootRequest; response: DevServerStatus };
  "devserver:stop": { request: ProjectRootRequest; response: DevServerStatus };
  "devserver:status": { request: DevServerStatusRequest; response: DevServerStatus };
  "project:list": { request: null; response: ProjectList };
  "project:open": { request: ProjectRootRequest; response: ProjectInfo };
  "project:forget": { request: ProjectRootRequest; response: RecentProject[] };
  /** Native folder picker; null when cancelled. */
  "dialog:chooseFolder": { request: ChooseFolderRequest; response: string | null };
}

export type Channel = keyof IpcContract;
export type RequestOf<C extends Channel> = IpcContract[C]["request"];
export type ResponseOf<C extends Channel> = IpcContract[C]["response"];

export const CHANNELS = [
  "app:info",
  "page:tree",
  "project:create",
  "devserver:start",
  "devserver:stop",
  "devserver:status",
  "project:list",
  "project:open",
  "project:forget",
  "dialog:chooseFolder",
] as const satisfies readonly Channel[];

// Compile-time check that CHANNELS lists every channel in IpcContract.
type Missing = Exclude<Channel, (typeof CHANNELS)[number]>;
const allChannelsListed: [Missing] extends [never] ? true : Missing = true;
void allChannelsListed;

export type IpcErrorCode =
  "bad-request" | "untrusted-sender" | "not-found" | "failed";

export interface IpcError {
  code: IpcErrorCode;
  channel: string;
  message: string;
}

/**
 * Handlers never throw across the boundary: Electron flattens thrown errors into a
 * string. Every call resolves to a result instead.
 */
export type IpcResult<T> =
  { ok: true; value: T } | { ok: false; error: IpcError };

/** What the preload exposes on `window.skeleton`. */
export interface SkeletonBridge {
  invoke<C extends Channel>(
    channel: C,
    request: RequestOf<C>,
  ): Promise<IpcResult<ResponseOf<C>>>;
}

export function isChannel(value: unknown): value is Channel {
  return (
    typeof value === "string" && (CHANNELS as readonly string[]).includes(value)
  );
}
