// Messages between Skeleton's renderer (host) and the overlay running inside the
// user's app. postMessage only; both sides pin the other's origin and validate shape.
// This file is imported by the renderer for types, so it must stay dependency-free.

/** A source element on the current page, flattened from core's tree. */
export interface OverlayNode {
  /** Stable within one tree: the node's path of child indexes, e.g. "0.2.1". */
  key: string;
  kind: "palette" | "primitive" | "plain" | "locked";
  name: string;
  id: string | null;
  /** Why it's locked; null unless kind is "locked". */
  lockReason: string | null;
  /** True for JSX elements (matched by exact start offset), false for expression blocks. */
  element: boolean;
  /** Source offsets in `file` (end exclusive). */
  start: number;
  end: number;
  /** An editable container with an ID: dragged elements can be dropped into it (T3.2). */
  drop: boolean;
  /** Can be dragged to another place on the page (T3.3): its parent is editable and it can be addressed. */
  move: boolean;
}

/** Where a drag would land: child `index` of the node at `parentKey`. */
export interface DropTarget {
  parentKey: string;
  index: number;
}

/** What a token affects (T4.2), from core's tokenUsage. */
export interface TokenUsage {
  /** Regex sources matching base utilities (variants stripped) that read the token. */
  classes: string[];
  /** Base-layer selectors styled with the token. */
  selectors: string[];
}

export type HostMessage =
  /**
   * The page being shown and its nodes, parsed from the file text whose sourceVersion
   * is `version`. Sent after load and after every re-parse.
   */
  | { source: "skeleton-host"; type: "tree"; file: string; version: string; nodes: OverlayNode[] }
  | { source: "skeleton-host"; type: "select"; key: string | null }
  | { source: "skeleton-host"; type: "highlight"; key: string | null }
  /** "select": clicks select elements. "interact": clicks go to the app. */
  | { source: "skeleton-host"; type: "mode"; mode: "select" | "interact" }
  /** Preview light or dark mode by toggling `.dark` on <html> (PRD §10.5). */
  | { source: "skeleton-host"; type: "theme"; dark: boolean }
  /**
   * A drag is over this frame at (x, y), in the frame's viewport coordinates. `moving`
   * is the key of the node being moved (never dropped into itself), or null for a new element.
   */
  | { source: "skeleton-host"; type: "drag"; x: number; y: number; moving: string | null; seq: number }
  /** The drag left this frame, ended or was cancelled; also cancels a move drag in the frame (Escape). */
  | { source: "skeleton-host"; type: "drag-end" }
  /** Load `path` (a same-origin path), replacing the current history entry. */
  | { source: "skeleton-host"; type: "navigate"; path: string }
  /** Count what each token affects and report `token-counts` as the page changes (T4.2); null stops. */
  | { source: "skeleton-host"; type: "token-usage"; usage: Record<string, TokenUsage> | null }
  /** Outline every element the token affects; null clears. */
  | { source: "skeleton-host"; type: "token-highlight"; name: string | null };

export interface NodeBox {
  key: string;
  /** Viewport rects of the node's DOM (one per top-level DOM element). */
  rects: { x: number; y: number; width: number; height: number }[];
}

export type OverlayMessage =
  | { source: "skeleton-overlay"; type: "ready"; pathname: string }
  | { source: "skeleton-overlay"; type: "hover"; key: string | null }
  | { source: "skeleton-overlay"; type: "select"; key: string | null }
  | { source: "skeleton-overlay"; type: "location"; pathname: string }
  /** Vite applied an update or is about to reload: the host should re-parse. */
  | { source: "skeleton-overlay"; type: "updated" }
  /**
   * Which nodes have DOM on screen, for the tree at `version`: after each tree message,
   * and again when DOM changes alter the answer. Nothing maps until the rendered app is
   * the same version of the file as the tree, so boxes for the current version mean the
   * canvas is in sync.
   */
  | { source: "skeleton-overlay"; type: "mapped"; version: string; boxes: NodeBox[] }
  /**
   * Where the current drag would land, in answer to each drag message (echoing its
   * `seq`, 0 when not answering one); null for nowhere.
   */
  | { source: "skeleton-overlay"; type: "drop-target"; target: DropTarget | null; seq: number }
  /** The user dragged the node at `key` on the canvas and dropped it at `target` (T3.3). */
  | { source: "skeleton-overlay"; type: "move"; key: string; target: DropTarget }
  /** A Skeleton shortcut pressed while the frame has focus, in select mode (Delete, undo…). */
  | { source: "skeleton-overlay"; type: "key"; key: string; mod: boolean; shift: boolean }
  /** How many rendered elements each token affects (T4.2): after `token-usage`, and when it changes. */
  | { source: "skeleton-overlay"; type: "token-counts"; counts: Record<string, number> };

export function isOverlayMessage(value: unknown): value is OverlayMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["source"] !== "skeleton-overlay" || typeof v["type"] !== "string") return false;
  switch (v["type"]) {
    case "ready":
    case "location":
      return typeof v["pathname"] === "string";
    case "hover":
    case "select":
      return v["key"] === null || typeof v["key"] === "string";
    case "updated":
      return true;
    case "mapped":
      return typeof v["version"] === "string" && Array.isArray(v["boxes"]);
    case "drop-target":
      return Number.isInteger(v["seq"]) && (v["target"] === null || isDropTarget(v["target"]));
    case "move":
      return typeof v["key"] === "string" && isDropTarget(v["target"]);
    case "key":
      return typeof v["key"] === "string" && typeof v["mod"] === "boolean" && typeof v["shift"] === "boolean";
    case "token-counts":
      return isRecordOf(v["counts"], (n) => Number.isInteger(n));
    default:
      return false;
  }
}

function isRecordOf(value: unknown, check: (v: unknown) => boolean): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(check);
}

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((s) => typeof s === "string");

function isTokenUsage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const u = value as Record<string, unknown>;
  return isStringList(u["classes"]) && isStringList(u["selectors"]);
}

function isDropTarget(value: unknown): value is DropTarget {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return typeof t["parentKey"] === "string" && Number.isInteger(t["index"]) && (t["index"] as number) >= 0;
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["source"] !== "skeleton-host") return false;
  switch (v["type"]) {
    case "tree":
      return typeof v["file"] === "string" && typeof v["version"] === "string" && Array.isArray(v["nodes"]);
    case "select":
    case "highlight":
      return v["key"] === null || typeof v["key"] === "string";
    case "mode":
      return v["mode"] === "select" || v["mode"] === "interact";
    case "theme":
      return typeof v["dark"] === "boolean";
    case "drag":
      return (
        Number.isFinite(v["x"]) &&
        Number.isFinite(v["y"]) &&
        Number.isInteger(v["seq"]) &&
        (v["moving"] === null || typeof v["moving"] === "string")
      );
    case "drag-end":
      return true;
    case "navigate":
      return typeof v["path"] === "string" && v["path"].startsWith("/") && !v["path"].startsWith("//");
    case "token-usage":
      return v["usage"] === null || isRecordOf(v["usage"], isTokenUsage);
    case "token-highlight":
      return v["name"] === null || typeof v["name"] === "string";
    default:
      return false;
  }
}

/** Keys the overlay forwards to the host in select mode (with Ctrl or Cmd for letters). */
export function isShortcut(key: string, mod: boolean): boolean {
  return key === "Delete" || key === "Backspace" || (mod && ["z", "Z", "y", "Y"].includes(key));
}

/**
 * The attribute the dev plugin adds to page-file JSX: "<project-relative file>:<offset>@<version>",
 * where <version> is the sourceVersion of the file text the offset is in.
 */
export const LOC_ATTR = "data-skeleton-loc";
