// Drop geometry (T3.2): where in a container a dragged element would land, and where
// to draw the indicator. Pure functions over rects, so they're tested without a DOM.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a container lays out its children, from its computed style. */
export type Flow = "vertical" | "horizontal" | "grid";

export interface PlacedChild {
  /** The child's index among the container's children (as `insert` counts them). */
  index: number;
  rect: Rect;
}

/**
 * Container flow from computed `display`, `flex-direction` and `grid-template-columns`.
 * Block layout, and a grid with a single column, stack vertically.
 */
export function flowOf(display: string, flexDirection: string, gridTemplateColumns = "none"): Flow {
  if (display === "grid" || display === "inline-grid") {
    // Computed tracks are a list of sizes, possibly with [line names] between them.
    const tracks = gridTemplateColumns.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter((t) => t !== "" && t !== "none");
    return tracks.length > 1 ? "grid" : "vertical";
  }
  if ((display === "flex" || display === "inline-flex") && flexDirection.startsWith("row")) return "horizontal";
  return "vertical";
}

/**
 * The insertion index for a point: before the first child (in source order) that the
 * point comes before along the flow, else after the last child. `count` is the number
 * of children; children without a rect (nothing rendered) are absent from `placed`.
 */
export function dropIndex(flow: Flow, placed: PlacedChild[], x: number, y: number, count: number): number {
  for (const { index, rect } of placed) {
    const before =
      flow === "vertical"
        ? y < rect.y + rect.height / 2
        : flow === "horizontal"
          ? x < rect.x + rect.width / 2
          : // Grid: rows first, then columns within the row the point is in.
            y < rect.y || (y < rect.y + rect.height && x < rect.x + rect.width / 2);
    if (before) return index;
  }
  return count;
}

/** Within this distance of a container's edge, along its parent's flow, a drop goes beside it, not into it. */
export const BESIDE = 8;

/**
 * Is the point in the band at the start or end of a container along `parentFlow`?
 * Then a drop goes before or after it in its parent instead of into it (F-1, F-4).
 * Rows and grids use the left and right edges, columns the top and bottom. The band is
 * at most a quarter of the container, so a small one still has a middle to drop into.
 *
 * When the container lays its own children out along the same axis (a column in a
 * column), its edge is also "first" or "last" inside it, so the band only counts
 * where no child is under the point (the container's own padding). Across axes (a row
 * in a column, a column in a grid) "into" has nothing to say at that edge.
 */
export function besideSide(
  parentFlow: Flow,
  container: { rect: Rect; flow: Flow; children: Rect[] },
  x: number,
  y: number,
  band = BESIDE,
): "before" | "after" | null {
  const { rect } = container;
  const vertical = parentFlow === "vertical";
  const start = vertical ? rect.y : rect.x;
  const size = vertical ? rect.height : rect.width;
  const at = vertical ? y : x;
  const edge = Math.min(band, size / 4);
  if (edge <= 0) return null;
  const side = at < start + edge ? "before" : at >= start + size - edge ? "after" : null;
  if (side === null) return null;
  const sameAxis = container.flow === "grid" || (container.flow === "vertical") === vertical;
  const overChild = container.children.some((c) => x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height);
  return sameAxis && overChild ? null : side;
}

const LINE = 2;

/**
 * The indicator for inserting at `index`: a line between the neighbouring children
 * (across the container), or the whole container when it has no rendered children.
 */
export function indicatorRect(flow: Flow, container: Rect, placed: PlacedChild[], index: number): { rect: Rect; fill: boolean } {
  if (placed.length === 0) return { rect: container, fill: true };
  const after = placed.find((c) => c.index >= index)?.rect ?? null;
  const before = [...placed].reverse().find((c) => c.index < index)?.rect ?? null;
  if (flow === "vertical") {
    const y = before && after ? (before.y + before.height + after.y) / 2 : after ? after.y - LINE : (before as Rect).y + (before as Rect).height + LINE;
    return { rect: { x: container.x, y: y - LINE / 2, width: container.width, height: LINE }, fill: false };
  }
  if (flow === "horizontal") {
    const x = before && after ? (before.x + before.width + after.x) / 2 : after ? after.x - LINE : (before as Rect).x + (before as Rect).width + LINE;
    return { rect: { x: x - LINE / 2, y: container.y, width: LINE, height: container.height }, fill: false };
  }
  // Grid: a vertical line at the left edge of the child it goes before, or after the last.
  const ref = after ?? (before as Rect);
  const x = after ? after.x - LINE : ref.x + ref.width + LINE;
  return { rect: { x: x - LINE / 2, y: ref.y, width: LINE, height: ref.height }, fill: false };
}

/** Smallest rect covering all of `rects`, or null for none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Within this distance of a frame edge, a drag scrolls the page. */
export const EDGE = 48;
const MAX_STEP = 18;

/**
 * How far to scroll per frame for a drag at `y` in a viewport `height` tall: faster the
 * closer to the edge, 0 away from the edges.
 */
export function edgeScroll(y: number, height: number): number {
  if (y < EDGE) return -Math.ceil(MAX_STEP * Math.min(1, (EDGE - y) / EDGE));
  if (y > height - EDGE) return Math.ceil(MAX_STEP * Math.min(1, (y - (height - EDGE)) / EDGE));
  return 0;
}
