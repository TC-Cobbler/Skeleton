// The IPC contract between the renderer (UI only) and the main process (filesystem,
// git, child processes, AST). This is the only module the renderer imports from
// app-main, and only for types. See docs/decisions/003-ipc-boundaries.md.

import type { PageTree, RouteInfo } from "@skeleton/core";
import type { ClassGroup, ElementSchema, PaletteGroup, PaletteItem } from "@skeleton/templates";

export type { PageTree, UiNode, NodeKind, RouteInfo } from "@skeleton/core";
export type { ClassGroup, ElementSchema, PaletteGroup, PaletteItem, PropSchema } from "@skeleton/templates";

/** A page's parsed tree plus the version of the text it was parsed from (core's sourceVersion). */
export interface PageView extends PageTree {
  version: string;
}

export interface PaletteEntry extends PaletteItem {
  /** The entry can be placed: it has a template and the project exports every component it uses. */
  available: boolean;
  /** Components the template uses that the project lacks, e.g. "Grid (src/components/layout/index.ts)". */
  missing: string[];
}

export interface Palette {
  groups: { id: PaletteGroup; label: string }[];
  items: PaletteEntry[];
  /** Prop schema per element name (for the properties panel). */
  elements: Record<string, ElementSchema>;
  /** Layout properties edited as classes, for schemas with `layout` (T3.5). */
  layout: { stack: ClassGroup[]; grid: ClassGroup[] };
}

export interface PageEntry extends RouteInfo {
  /** The page file exists on disk (false for missing or unresolvable files). */
  exists: boolean;
}

export interface PageList {
  /** The router file that was read. */
  routerFile: string;
  pages: PageEntry[];
  /** Why the router couldn't be read, or null. */
  error: string | null;
}

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

export interface GitStatus {
  head: string;
  clean: boolean;
  /** Paths with uncommitted changes (tracked or not, excluding ignored). */
  changed: string[];
}

export interface GitCommit {
  hash: string;
  subject: string;
  /** Commit time, ms since the epoch. */
  time: number;
}

export interface GitFileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  /** Unified diff for this file. */
  patch: string;
}

export interface GitDiff {
  from: string;
  /** Null when diffing against the working tree. */
  to: string | null;
  files: GitFileDiff[];
}

export interface GitCommitRequest extends ProjectRootRequest {
  message: string;
}

export interface GitLogRequest extends ProjectRootRequest {
  limit: number;
}

export interface GitDiffRequest extends ProjectRootRequest {
  from: string;
  /** Null for the working tree. */
  to: string | null;
}

export interface GitRevertRequest extends ProjectRootRequest {
  /** The commit whose state the project should return to. */
  commit: string;
}

export interface ProjectChanges {
  /** Moves every time files under src/ change (while unlocked). */
  revision: number;
  /** With the agent: external changes are ignored until take-back (Phase 5). */
  locked: boolean;
  /** Project-relative paths changed in the latest revision ("*" after an unlock catch-up). */
  changed: string[];
  /** Why watching isn't working, or null. */
  error: string | null;
}

/** What the user did on the canvas, as an edit to one page file (Phase 3). */
/** A node by its ID, or by position under an ID'd parent (for un-ID'd locked blocks). */
export type NodeRef = { id: string } | { parentId: string; index: number };

export type EditIntent =
  /** Place a palette entry in `parentId` at child `index` (T3.2). */
  | { op: "insert"; parentId: string; index: number; paletteId: string }
  /** Move a node (locked blocks included) to `newParentId` at `index`, counted with the node taken out (T3.3). */
  | { op: "move"; ref: NodeRef; newParentId: string; index: number }
  /**
   * Remove a node and everything under it (T3.4). `allowLocked` is the user's
   * confirmation that agent logic inside it (locked blocks, protected props) goes too.
   */
  | { op: "remove"; ref: NodeRef; allowLocked: boolean }
  /** Set (or with null, remove) a literal prop (T3.5). */
  | { op: "setProp"; id: string; key: string; value: string | number | boolean | null }
  /** Replace an element's text content (T3.5). */
  | { op: "setText"; id: string; text: string }
  /** Add and remove Tailwind classes on a literal className (T3.5 layout properties). */
  | { op: "setClass"; id: string; add: string[]; remove: string[] };

/** A page operation (T3.6): writes the router and the page file. */
export type PageIntent =
  | { op: "addPage"; name: string; path: string }
  /** Change the page's path and/or name (its component and file follow the name). */
  | { op: "renamePage"; path: string; name: string | null; newPath: string | null }
  | { op: "deletePage"; path: string };

export interface PageOpRequest extends ProjectRootRequest {
  page: PageIntent;
}

export interface PageOpResult {
  /** The page to show afterwards (the new or renamed page; after a delete, another one). */
  path: string | null;
  /** Project-relative files created, changed or deleted. */
  files: string[];
  /** Why the op couldn't be typechecked (T3.7), or null when it was. */
  unchecked: string | null;
}

/** What Undo and Redo would do next (T3.8), as labels like "Insert Button"; null when there's nothing. */
export interface EditHistory {
  undo: string | null;
  redo: string | null;
}

export interface HistoryStepResult {
  /** The edit that was undone or redone. */
  label: string;
  /** Project-relative files it wrote or deleted. */
  files: string[];
  unchecked: string | null;
  history: EditHistory;
}

export interface PageEditRequest extends PageTreeRequest {
  edit: EditIntent;
}

export interface PageEditResult {
  file: string;
  /** The ID to select after the edit (the placed element), or null. */
  select: string | null;
  /** The unified diff the edit made (no context lines). */
  patch: string;
  linesAdded: number;
  linesRemoved: number;
  /** Why the edit couldn't be typechecked (T3.7), or null when it was. */
  unchecked: string | null;
}

/** Every channel: what the renderer sends and what main answers with. */
export interface IpcContract {
  "app:info": { request: null; response: AppInfo };
  "page:tree": { request: PageTreeRequest; response: PageView };
  /** The page file's source text (for "view source" on locked blocks). */
  "page:source": { request: PageTreeRequest; response: string };
  /** Apply one canvas edit to a page file (a core edit op) and write it. */
  "page:edit": { request: PageEditRequest; response: PageEditResult };
  /** Undo the last canvas edit or page op this session (T3.8). */
  "edit:undo": { request: ProjectRootRequest; response: HistoryStepResult };
  /** Redo the last undone edit (T3.8). */
  "edit:redo": { request: ProjectRootRequest; response: HistoryStepResult };
  /** What Undo and Redo would do next. */
  "edit:history": { request: ProjectRootRequest; response: EditHistory };
  /** Add, rename or delete a page: its route and its file (T3.6). */
  "project:page": { request: PageOpRequest; response: PageOpResult };
  /** The curated components and primitives, checked against the project's files (T3.1). */
  "palette:list": { request: ProjectRootRequest; response: Palette };
  /** Pages from the project's router (T2.5). */
  "project:pages": { request: ProjectRootRequest; response: PageList };
  /** File-change revision for re-parsing (T2.6); starts watching on first call. */
  "project:changes": { request: ProjectRootRequest; response: ProjectChanges };
  "project:create": { request: ProjectCreateRequest; response: ProjectCreateResponse };
  "devserver:start": { request: ProjectRootRequest; response: DevServerStatus };
  "devserver:stop": { request: ProjectRootRequest; response: DevServerStatus };
  "devserver:status": { request: DevServerStatusRequest; response: DevServerStatus };
  "project:list": { request: null; response: ProjectList };
  "project:open": { request: ProjectRootRequest; response: ProjectInfo };
  "project:forget": { request: ProjectRootRequest; response: RecentProject[] };
  /** Native folder picker; null when cancelled. */
  "dialog:chooseFolder": { request: ChooseFolderRequest; response: string | null };
  "git:status": { request: ProjectRootRequest; response: GitStatus };
  /** Stages everything and commits; null when there was nothing to commit. */
  "git:commit": { request: GitCommitRequest; response: GitCommit | null };
  "git:log": { request: GitLogRequest; response: GitCommit[] };
  "git:diff": { request: GitDiffRequest; response: GitDiff };
  /** Restores the project to a commit's state as a new commit. */
  "git:revert": { request: GitRevertRequest; response: GitCommit };
}

export type Channel = keyof IpcContract;
export type RequestOf<C extends Channel> = IpcContract[C]["request"];
export type ResponseOf<C extends Channel> = IpcContract[C]["response"];

export const CHANNELS = [
  "app:info",
  "page:tree",
  "page:source",
  "page:edit",
  "edit:undo",
  "edit:redo",
  "edit:history",
  "project:page",
  "palette:list",
  "project:pages",
  "project:changes",
  "project:create",
  "devserver:start",
  "devserver:stop",
  "devserver:status",
  "project:list",
  "project:open",
  "project:forget",
  "dialog:chooseFolder",
  "git:status",
  "git:commit",
  "git:log",
  "git:diff",
  "git:revert",
] as const satisfies readonly Channel[];

// Compile-time check that CHANNELS lists every channel in IpcContract.
type Missing = Exclude<Channel, (typeof CHANNELS)[number]>;
const allChannelsListed: [Missing] extends [never] ? true : Missing = true;
void allChannelsListed;

/**
 * - `edit-refused`: the edit op refused the edit (locked block, bad target…); nothing was written.
 * - `edit-rolled-back`: the edit was written, broke the typecheck, and was undone (T3.7).
 */
export type IpcErrorCode = "bad-request" | "untrusted-sender" | "not-found" | "edit-refused" | "edit-rolled-back" | "failed";

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
