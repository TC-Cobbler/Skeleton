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
}

/** Where a drag would land: child `index` of the node at `parentKey`. */
export interface DropTarget {
  parentKey: string;
  index: number;
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
  | { source: "skeleton-host"; type: "drag"; x: number; y: number; moving: string | null }
  /** The drag left this frame, ended or was cancelled. */
  | { source: "skeleton-host"; type: "drag-end" };

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
  /** Which nodes have DOM on screen, in response to a tree message (for tests and tree badges). */
  | { source: "skeleton-overlay"; type: "mapped"; boxes: NodeBox[] }
  /** Where the current drag would land, in answer to each drag message; null for nowhere. */
  | { source: "skeleton-overlay"; type: "drop-target"; target: DropTarget | null };

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
      return Array.isArray(v["boxes"]);
    case "drop-target": {
      const t = v["target"];
      if (t === null) return true;
      if (typeof t !== "object" || t === undefined) return false;
      const target = t as Record<string, unknown>;
      return typeof target["parentKey"] === "string" && Number.isInteger(target["index"]) && (target["index"] as number) >= 0;
    }
    default:
      return false;
  }
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
      return Number.isFinite(v["x"]) && Number.isFinite(v["y"]) && (v["moving"] === null || typeof v["moving"] === "string");
    case "drag-end":
      return true;
    default:
      return false;
  }
}

/**
 * The attribute the dev plugin adds to page-file JSX: "<project-relative file>:<offset>@<version>",
 * where <version> is the sourceVersion of the file text the offset is in.
 */
export const LOC_ATTR = "data-skeleton-loc";
