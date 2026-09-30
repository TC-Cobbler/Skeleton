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

/** Every channel: what the renderer sends and what main answers with. */
export interface IpcContract {
  "app:info": { request: null; response: AppInfo };
  "page:tree": { request: PageTreeRequest; response: PageTree };
}

export type Channel = keyof IpcContract;
export type RequestOf<C extends Channel> = IpcContract[C]["request"];
export type ResponseOf<C extends Channel> = IpcContract[C]["response"];

export const CHANNELS = [
  "app:info",
  "page:tree",
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
