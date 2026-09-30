// The overlay (T2.2). Runs inside the user's app, injected by Skeleton's dev plugin.
// Draws hover/selection outlines and maps DOM ↔ source through NodeIndex. Talks to
// the host only via postMessage; never imports from core.

import { dropIndex, edgeScroll, flowOf, indicatorRect, unionRect, type PlacedChild } from "./drop.js";
import { NodeIndex } from "./mapping.js";
import { isHostMessage, type DropTarget, type HostMessage, type NodeBox, type OverlayMessage, type OverlayNode } from "./protocol.js";

type Rect = NodeBox["rects"][number];

/** Pointer travel before a press on the canvas becomes a move drag. */
const MOVE_THRESHOLD = 4;

const COLORS = {
  hover: "#3b82f6",
  selected: "#2563eb",
  locked: "#ea580c",
  drop: "#2563eb",
};

interface DropState extends DropTarget {
  container: Rect;
  indicator: Rect;
  /** The container is empty: the indicator fills it. */
  fill: boolean;
}

export interface OverlayOptions {
  win: Window;
  /** The host window (the renderer). */
  host: Window;
}

export class Overlay {
  private index: NodeIndex | null = null;
  private hovered: string | null = null;
  private selected: string | null = null;
  private highlighted: string | null = null;
  private mode: "select" | "interact" = "select";
  private drop: DropState | null = null;
  /** A press in select mode that may become a move drag (T3.3). */
  private press: { x: number; y: number; key: string | null } | null = null;
  /** The node being moved by a drag inside this frame. */
  private moving: string | null = null;
  /** The click that ends a move drag must not select. */
  private swallowClick = false;
  /** The latest drag position (palette or move), for scrolling at the edges. */
  private dragAt: { x: number; y: number; moving: string | null } | null = null;
  private scrollFrame = 0;
  /** The host is dragging something from outside the frame (a palette entry). */
  private hostDragging = false;
  /** The DOM changed since `mapped` was last reported. */
  private remap = false;
  private lastMapped = "";
  private readonly layer: HTMLElement;
  private readonly shadow: ShadowRoot;
  private frame = 0;
  private readonly doc: Document;
  private readonly abort = new AbortController();
  private observer: MutationObserver | null = null;

  constructor(private readonly options: OverlayOptions) {
    this.doc = options.win.document;
    this.layer = this.doc.createElement("skeleton-overlay");
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    this.shadow = this.layer.attachShadow({ mode: "open" });
  }

  start(): void {
    const { win } = this.options;
    const signal = this.abort.signal;
    this.doc.documentElement.appendChild(this.layer);
    win.addEventListener("message", (e) => this.onMessage(e), { signal });
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"] as const) {
      win.addEventListener(type, (e) => this.onPointer(e), { capture: true, signal });
    }
    // pointermove, not mousemove: the pointerdown is cancelled in select mode, and that
    // suppresses mouse events until release, so a move drag would see no mousemoves.
    win.addEventListener("pointermove", (e) => this.onMove(e), { capture: true, signal });
    win.addEventListener("keydown", (e) => e.key === "Escape" && this.cancelMove(), { capture: true, signal });
    // A drag that lost its release (pointer let go outside, focus lost) is cancelled.
    win.addEventListener("pointercancel", () => this.cancelMove(), { capture: true, signal });
    win.addEventListener("blur", () => this.cancelMove(), { signal });
    this.doc.addEventListener("mouseleave", () => this.setHover(null), { signal });
    this.observer = new MutationObserver(() => {
      this.index?.invalidate();
      this.remap = true;
      this.schedule();
    });
    this.observer.observe(this.doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    win.addEventListener("scroll", () => this.schedule(), { capture: true, signal });
    win.addEventListener("resize", () => this.schedule(), { signal });
    this.watchLocation(signal);
    this.post({ source: "skeleton-overlay", type: "ready", pathname: win.location.pathname });
  }

  /** Detach everything: listeners, observer, drawing layer. */
  destroy(): void {
    this.abort.abort();
    this.observer?.disconnect();
    if (this.frame) this.options.win.cancelAnimationFrame(this.frame);
    this.layer.remove();
  }

  /** For Vite HMR hooks in the entry module. */
  notifyUpdated(): void {
    this.post({ source: "skeleton-overlay", type: "updated" });
  }

  private post(message: OverlayMessage): void {
    // The host may be file:// (origin "null"), so no target origin can be named here.
    // Messages carry no secrets; the host checks source and origin on receipt.
    this.options.host.postMessage(message, "*");
  }

  private onMessage(event: MessageEvent): void {
    if (event.source !== this.options.host || !isHostMessage(event.data)) return;
    const msg: HostMessage = event.data;
    switch (msg.type) {
      case "tree":
        this.index = new NodeIndex(msg.file, msg.version, msg.nodes);
        if (this.selected && !msg.nodes.some((n) => n.key === this.selected)) this.selected = null;
        this.reportMapped(true);
        break;
      case "select":
        // An echo of this frame's own click must not scroll the page under the cursor;
        // only selections made elsewhere (the tree, another frame) are brought into view.
        if (msg.key !== this.selected) {
          this.selected = msg.key;
          this.scrollIntoView(msg.key);
        }
        break;
      case "highlight":
        this.highlighted = msg.key;
        break;
      case "mode":
        this.mode = msg.mode;
        if (msg.mode === "interact") this.setHover(null);
        break;
      case "theme":
        this.doc.documentElement.classList.toggle("dark", msg.dark);
        break;
      case "drag":
        this.hovered = null;
        this.hostDragging = true;
        this.dragTo(msg.x, msg.y, msg.moving);
        this.reportDrop();
        break;
      case "drag-end":
        // Also cancels a move drag: Escape reaches the host's window, not this frame.
        this.hostDragging = false;
        this.press = null;
        this.moving = null;
        this.endDrag();
        this.post({ source: "skeleton-overlay", type: "drop-target", target: null });
        break;
    }
    this.schedule();
  }

  /**
   * Where a drop at (x, y) lands: the innermost drop container at the point (never
   * the node being moved or anything inside it), and the index among its children
   * from their rendered positions along the container's flow.
   */
  private dropAt(x: number, y: number, moving: string | null): DropState | null {
    if (!this.index || !this.doc.body) return null;
    const at = deepestAt(this.doc.elementFromPoint(x, y), x, y);
    if (!at || at === this.layer) return null;
    const hit = this.index.hit(at);
    const inMoving = (key: string) => moving !== null && (key === moving || key.startsWith(`${moving}.`));
    for (let key: string | null = hit?.key ?? null; key !== null; key = parentKeyOf(key)) {
      const node = this.node(key);
      if (!node?.drop || inMoving(key)) continue;
      const elements = this.index.elementsOf(node, this.doc.body, this.layer);
      const container = unionRect(elements.map(rectOf));
      if (!elements[0] || !container) continue;
      const style = this.options.win.getComputedStyle(elements[0]);
      const flow = flowOf(style.display, style.flexDirection, style.gridTemplateColumns);
      // Indexes count the children as they'll be once the moved node is taken out.
      const placed: PlacedChild[] = [];
      let count = 0;
      for (const child of this.index.nodes) {
        if (parentKeyOf(child.key) !== key || child.key === moving) continue;
        const rect = unionRect(this.rects(child));
        if (rect) placed.push({ index: count, rect });
        count++;
      }
      const index = dropIndex(flow, placed, x, y, count);
      const { rect, fill } = indicatorRect(flow, container, placed, index);
      return { parentKey: key, index, container, indicator: rect, fill };
    }
    return null;
  }

  private target(event: Event): OverlayNode | null {
    if (!this.index) return null;
    // Hit-test by position: browsers don't deliver mouse events to disabled form
    // controls, and elementFromPoint skips pointer-events: none (disabled shadcn
    // buttons), so descend from the hit to the deepest element at the point.
    const at =
      event instanceof MouseEvent && event.isTrusted
        ? deepestAt(this.doc.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY)
        : null;
    const el = at ?? event.target;
    if (!(el instanceof Element) || el === this.layer) return null;
    return this.index.hit(el);
  }

  private onMove(event: MouseEvent): void {
    if (this.mode !== "select") return;
    const press = this.press;
    if (press && (event.buttons & 1) === 0) {
      this.cancelMove();
      return;
    }
    if (press && press.key !== null) {
      if (this.moving === null && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= MOVE_THRESHOLD) {
        this.moving = press.key;
        this.setHover(null);
      }
      if (this.moving !== null) {
        this.dragTo(event.clientX, event.clientY, this.moving);
        return;
      }
    }
    if (this.drop) return;
    this.setHover(this.target(event)?.key ?? null);
  }

  /** The nearest node at or above `node` that can be moved (a drag on a wrapped element moves its block). */
  private movableFrom(node: OverlayNode | null): string | null {
    for (let key: string | null = node?.key ?? null; key !== null; key = parentKeyOf(key)) {
      if (this.node(key)?.move) return key;
    }
    return null;
  }

  private cancelMove(): void {
    if (this.moving === null && this.press === null) return;
    this.press = null;
    this.moving = null;
    this.endDrag();
  }

  /** A drag (palette or move) is at (x, y): find the drop target, and scroll at the edges. */
  private dragTo(x: number, y: number, moving: string | null): void {
    this.dragAt = { x, y, moving };
    this.drop = this.dropAt(x, y, moving);
    this.schedule();
    if (!this.scrollFrame && edgeScroll(y, this.options.win.innerHeight) !== 0) {
      const { win } = this.options;
      const step = () => {
        this.scrollFrame = 0;
        const at = this.dragAt;
        const delta = at ? edgeScroll(at.y, win.innerHeight) : 0;
        if (!at || delta === 0) return;
        const before = win.scrollY;
        win.scrollBy(0, delta);
        if (win.scrollY === before) return; // at the end of the page
        this.drop = this.dropAt(at.x, at.y, at.moving);
        this.reportDrop();
        this.schedule();
        this.scrollFrame = win.requestAnimationFrame(step);
      };
      this.scrollFrame = win.requestAnimationFrame(step);
    }
  }

  private endDrag(): void {
    this.dragAt = null;
    this.drop = null;
    if (this.scrollFrame) this.options.win.cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
    this.schedule();
  }

  /** Tell the host where a palette drag would land now (move drags report on release). */
  private reportDrop(): void {
    if (this.moving !== null || !this.hostDragging) return;
    const target = this.drop ? { parentKey: this.drop.parentKey, index: this.drop.index } : null;
    this.post({ source: "skeleton-overlay", type: "drop-target", target });
  }

  private onPointer(event: Event): void {
    if (this.mode !== "select") return;
    // In select mode the app never sees the pointer (so buttons don't fire and
    // menus don't open); a click selects instead.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === "pointerdown" && event instanceof MouseEvent && event.button === 0) {
      this.press = { x: event.clientX, y: event.clientY, key: this.movableFrom(this.target(event)) };
      this.swallowClick = false;
      // Keep receiving the drag's moves and its release even outside the frame.
      if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent && event.target instanceof Element) {
        try {
          event.target.setPointerCapture(event.pointerId);
        } catch (error) {
          // The pointer is already gone (released during dispatch); the press ends on the next move.
          console.warn("[skeleton overlay] couldn't capture the pointer", error);
        }
      }
      return;
    }
    if (event.type === "pointerup") {
      if (this.moving !== null) {
        const target = this.drop ? { parentKey: this.drop.parentKey, index: this.drop.index } : null;
        if (target) this.post({ source: "skeleton-overlay", type: "move", key: this.moving, target });
        this.swallowClick = true;
      }
      this.press = null;
      this.moving = null;
      this.endDrag();
      return;
    }
    if (event.type !== "click") return;
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    const node = this.target(event);
    this.selected = node?.key ?? null;
    this.post({ source: "skeleton-overlay", type: "select", key: this.selected });
    this.schedule();
  }

  private setHover(key: string | null): void {
    if (key === this.hovered) return;
    this.hovered = key;
    this.post({ source: "skeleton-overlay", type: "hover", key });
    this.schedule();
  }

  private node(key: string | null): OverlayNode | null {
    if (!key || !this.index) return null;
    return this.index.nodes.find((n) => n.key === key) ?? null;
  }

  private rects(node: OverlayNode): Rect[] {
    if (!this.index || !this.doc.body) return [];
    return this.index.elementsOf(node, this.doc.body, this.layer).map(rectOf);
  }

  private boxes(): NodeBox[] {
    if (!this.index) return [];
    return this.index.nodes
      .map((n) => ({ key: n.key, rects: this.rects(n) }))
      .filter((b) => b.rects.length > 0);
  }

  private scrollIntoView(key: string | null): void {
    const node = this.node(key);
    if (!node || !this.index || !this.doc.body) return;
    this.index.elementsOf(node, this.doc.body, this.layer)[0]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = this.options.win.requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /**
   * Tell the host which nodes are on screen: always after a tree, and after DOM
   * changes when the answer changed (the DOM can catch up with a tree after it arrived).
   */
  private reportMapped(always: boolean): void {
    this.remap = false;
    if (!this.index) return;
    const boxes = this.boxes();
    const keys = `${this.index.version} ${boxes.map((b) => b.key).join(" ")}`;
    if (!always && keys === this.lastMapped) return;
    this.lastMapped = keys;
    this.post({ source: "skeleton-overlay", type: "mapped", version: this.index.version, boxes });
  }

  private draw(): void {
    if (this.remap && this.index) this.reportMapped(false);
    const parts: string[] = [];
    // Labels placed so far; a new label slides right until it doesn't overlap one.
    const placed: Rect[] = [];
    const place = (x: number, y: number, text: string): { x: number; y: number } => {
      const width = text.length * 6.6 + 12;
      let left = x;
      for (let guard = 0; guard < 20; guard++) {
        const hit = placed.find((p) => left < p.x + p.width && left + width > p.x && y < p.y + p.height && y + 18 > p.y);
        if (!hit) break;
        left = hit.x + hit.width + 2;
      }
      placed.push({ x: left, y, width, height: 18 });
      return { x: left, y };
    };
    const box = (node: OverlayNode, color: string, width: number, dashed: boolean, label: boolean) => {
      const rects = this.rects(node);
      rects.forEach((r, i) => {
        parts.push(
          `<div class="box" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;` +
            `border:${width}px ${dashed ? "dashed" : "solid"} ${color}"></div>`,
        );
        if (label && i === 0) {
          const text = labelOf(node);
          const at = place(r.x, r.y >= 18 ? r.y - 18 : r.y + r.height, text);
          parts.push(`<div class="label" style="left:${at.x}px;top:${at.y}px;background:${color}">${escapeHtml(text)}</div>`);
        }
      });
    };
    // Locked blocks are always marked in select mode (T2.4), under hover/selection.
    if (this.mode === "select" && this.index) {
      for (const node of this.index.nodes) {
        if (node.kind === "locked" && node.key !== this.selected) box(node, COLORS.locked, 1, true, true);
      }
    }
    const hovered = this.node(this.hovered);
    const highlighted = this.node(this.highlighted);
    const selected = this.node(this.selected);
    if (highlighted && highlighted !== selected) box(highlighted, COLORS.hover, 1, false, true);
    if (hovered && hovered !== selected && hovered !== highlighted) {
      box(hovered, hovered.kind === "locked" ? COLORS.locked : COLORS.hover, 1, hovered.kind === "locked", true);
    }
    if (selected) box(selected, selected.kind === "locked" ? COLORS.locked : COLORS.selected, 2, selected.kind === "locked", true);
    const drop = this.drop;
    const dropNode = drop ? this.node(drop.parentKey) : null;
    if (drop && dropNode) {
      const { container: c, indicator: i } = drop;
      parts.push(
        `<div class="box" style="left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;border:1px dashed ${COLORS.drop}"></div>`,
        `<div class="box" data-drop-indicator style="left:${i.x}px;top:${i.y}px;width:${i.width}px;height:${i.height}px;` +
          `background:${drop.fill ? "rgb(37 99 235 / 0.15)" : COLORS.drop}"></div>`,
      );
      const moved = this.node(this.moving);
      const text = moved ? `Move ${labelOf(moved)} into ${labelOf(dropNode)}` : `Into ${labelOf(dropNode)}`;
      const at = place(c.x, c.y >= 18 ? c.y - 18 : c.y, text);
      parts.push(`<div class="label" style="left:${at.x}px;top:${at.y}px;background:${COLORS.drop}">${escapeHtml(text)}</div>`);
    }
    this.shadow.innerHTML =
      `<style>.box{position:fixed;box-sizing:border-box;pointer-events:none}` +
      `.label{position:fixed;font:11px/18px system-ui,sans-serif;color:#fff;padding:0 6px;border-radius:3px;white-space:nowrap}</style>` +
      parts.join("");
  }

  private watchLocation(signal: AbortSignal): void {
    const { win } = this.options;
    let last = win.location.pathname;
    const report = () => {
      if (win.location.pathname === last) return;
      last = win.location.pathname;
      this.post({ source: "skeleton-overlay", type: "location", pathname: last });
    };
    for (const method of ["pushState", "replaceState"] as const) {
      const original = win.history[method];
      win.history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
        original.apply(this, args);
        report();
      };
      signal.addEventListener("abort", () => {
        win.history[method] = original;
      });
    }
    win.addEventListener("popstate", report, { signal });
  }
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** "0.2.1" → "0.2"; a root's parent is null. */
export function parentKeyOf(key: string): string | null {
  const dot = key.lastIndexOf(".");
  return dot < 0 ? null : key.slice(0, dot);
}

/**
 * The deepest descendant of `el` whose box contains the point, children checked
 * last-first (roughly topmost first). Unlike elementFromPoint this includes elements
 * with pointer-events: none, such as shadcn buttons while disabled.
 */
export function deepestAt(el: Element | null, x: number, y: number): Element | null {
  if (!el) return null;
  for (let i = el.children.length - 1; i >= 0; i--) {
    const child = el.children[i] as Element;
    const r = child.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
      return deepestAt(child, x, y);
    }
  }
  return el;
}

/** Canvas label: element name and ID; locked blocks say what locks them. */
export function labelOf(node: OverlayNode): string {
  const id = node.id ? ` #${node.id}` : "";
  if (node.kind !== "locked") return `${node.name}${id}`;
  const what: Record<string, string> = { map: ".map()", conditional: "conditional", expression: "{…}", fragment: "<>…</>", spread: "{...}" };
  return `🔒 ${node.element ? node.name : (what[node.name] ?? node.name)}${id}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
