// The overlay (T2.2). Runs inside the user's app, injected by Skeleton's dev plugin.
// Draws hover/selection outlines and maps DOM ↔ source through NodeIndex. Talks to
// the host only via postMessage; never imports from core.

import { besideSide, dropIndex, edgeScroll, flowOf, indicatorRect, unionRect, type Flow, type PlacedChild } from "./drop.js";
import { handlesFor, LIVE_TARGET, planDrag, scopeOf, type Drag, type GizmoData, type Handle, type Measured, type Scope } from "./gizmos.js";
import { NodeIndex } from "./mapping.js";
import { stripVariants, TokenMatcher } from "./tokens.js";
import {
  isHostMessage,
  isShortcut,
  type DropTarget,
  type GizmoCommit,
  type HostMessage,
  type NodeBox,
  type NotePin,
  type OverlayMessage,
  type OverlayNode,
} from "./protocol.js";

type Rect = NodeBox["rects"][number];

/** Pointer travel before a press on the canvas becomes a move drag. */
const MOVE_THRESHOLD = 4;

const COLORS = {
  hover: "#3b82f6",
  selected: "#2563eb",
  locked: "#ea580c",
  drop: "#2563eb",
  token: "#9333ea",
  gizmo: "#db2777",
};

/** How long a released gizmo's preview may wait for the page to update before it goes anyway. */
const LIVE_SETTLE_MS = 4000;

/** A gizmo drag in progress (T4.3). */
interface GizmoDrag {
  key: string;
  handle: Handle;
  scope: Scope;
  drag: Drag;
  x: number;
  y: number;
  start: number;
  value: number;
  text: string;
  commit: GizmoCommit | null;
  /** Elements the token affects, counted at the start (T4.2). */
  count: number;
}

/** A container as rendered (see layoutOf). */
interface Layout {
  flow: Flow;
  container: Rect;
  placed: (PlacedChild & { key: string })[];
  count: number;
}

interface DropState extends DropTarget {
  container: Rect;
  indicator: Rect;
  /** The container is empty: the indicator fills it. */
  fill: boolean;
  /** The drop goes before or after this child of the container, aimed at its edge (F-1, F-4). */
  beside: { key: string; side: "before" | "after" } | null;
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
  /** What each token affects (T4.2), while the host wants counts. */
  private tokens: TokenMatcher | null = null;
  private tokenHighlight: string | null = null;
  private lastCounts = "";
  /** What the selected element's gizmos can do, from the host (T4.3). */
  private gizmoData: (GizmoData & { key: string }) | null = null;
  private gizmo: GizmoDrag | null = null;
  /** The handle under the pointer, with the scope its modifiers would pick (T4.5). */
  private gizmoHover: { handle: Handle; scope: Scope } | null = null;
  /** Why the last gizmo press couldn't start, shown by the handle for a moment. */
  private gizmoRefusal: { text: string; x: number; y: number; until: number } | null = null;
  /** Handles as last drawn, for hit-testing. */
  private handles: Handle[] = [];
  /** The live preview of a gizmo drag (T4.4), kept after release until the page updates. */
  private live: { style: HTMLStyleElement; target: Element; pending: boolean; timer: number } | null = null;
  /** Note pins to draw (T5.1). */
  private pins: NotePin[] = [];
  /** The Dialog or Sheet whose open state the host shows (F-6), and what was last reported. */
  private openWatch: string | null = null;
  private lastOpen = "";
  /** A click the overlay sends to the app itself (opening a Dialog): select mode lets it through. */
  private passClick = false;
  /** The text being edited on the canvas (F-5): a field over the element, outside the redrawn layer. */
  private textEditor: { key: string; input: HTMLInputElement; original: string } | null = null;
  /** Everything drawn per frame; the text editor sits beside it so redrawing keeps its focus. */
  private readonly drawn: HTMLElement;
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
    this.drawn = this.doc.createElement("div");
    this.shadow.appendChild(this.drawn);
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
    win.addEventListener("keydown", (e) => this.onKey(e), { capture: true, signal });
    // Focus moving into or out of the text editor is Skeleton's, not the app's: an open
    // modal's focus trap (Radix) would otherwise take it straight back (F-5 in F-6).
    for (const type of ["focusin", "focusout"] as const) {
      win.addEventListener(
        type,
        (e) => {
          const input = this.textEditor?.input;
          if (input && (e.composedPath().includes(input) || e.relatedTarget === this.layer)) e.stopImmediatePropagation();
        },
        { capture: true, signal },
      );
    }
    win.addEventListener(
      "keyup",
      (e) => {
        if (this.gizmoHover && (e.key === "Shift" || e.key === "Alt")) {
          this.gizmoHover = { ...this.gizmoHover, scope: scopeOf(e) };
          this.schedule();
        }
      },
      { capture: true, signal },
    );
    // A drag that lost its release (pointer let go outside, focus lost) is cancelled.
    win.addEventListener(
      "pointercancel",
      () => {
        this.cancelMove();
        this.cancelGizmo();
      },
      { capture: true, signal },
    );
    win.addEventListener(
      "blur",
      () => {
        this.cancelMove();
        this.cancelGizmo();
      },
      { signal },
    );
    // A gizmo drag captures the pointer (see startGizmo): losing the capture is its
    // release, even when the button came up outside the frame.
    this.doc.documentElement.addEventListener("lostpointercapture", () => this.gizmo && this.releaseGizmo(), { signal });
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
    // The written value is on the page now: the preview can go, once React has re-rendered.
    if (this.live?.pending) this.settleLive(150);
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
        // The edited element is gone or the page changed under it: the edit is off.
        if (this.textEditor) this.closeTextEditor(false);
        this.reportMapped(true);
        this.reportOpen();
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
        if (msg.mode === "interact") {
          this.setHover(null);
          this.closeTextEditor(false);
        }
        break;
      case "theme":
        this.doc.documentElement.classList.toggle("dark", msg.dark);
        break;
      case "drag":
        this.hovered = null;
        this.hostDragging = true;
        this.dragTo(msg.x, msg.y, msg.moving);
        this.reportDrop(msg.seq);
        break;
      case "navigate":
        this.options.win.location.replace(msg.path);
        return;
      case "token-usage":
        this.tokens = msg.usage ? new TokenMatcher(msg.usage, this.doc.createElement("div")) : null;
        this.lastCounts = "";
        this.reportCounts();
        break;
      case "token-highlight":
        this.tokenHighlight = msg.name;
        break;
      case "gizmos":
        this.gizmoData = { key: msg.key, tokens: msg.tokens, spacingSteps: msg.spacingSteps, classEdits: msg.classEdits };
        break;
      case "preview":
        // A preview already written waits for the page to update (see gizmo-done).
        if (msg.css === null) {
          if (this.live && !this.live.pending && !this.gizmo) this.clearLive();
        } else this.preview(msg.css);
        break;
      case "pins":
        this.pins = msg.pins;
        break;
      case "text-editor":
        if (this.mode === "select") this.openTextEditor(msg.key, msg.text);
        break;
      case "open":
        this.openWatch = msg.key;
        this.lastOpen = "";
        if (msg.key !== null && msg.open !== null) this.setOpen(msg.key, msg.open);
        this.reportOpen();
        break;
      case "gizmo-done":
        if (!msg.ok) this.clearLive();
        else if (this.live) {
          this.live.pending = true;
          this.settleLive(LIVE_SETTLE_MS);
        }
        break;
      case "drag-end":
        // Also cancels a move drag: Escape reaches the host's window, not this frame.
        this.hostDragging = false;
        this.press = null;
        this.moving = null;
        this.cancelGizmo();
        this.endDrag();
        this.post({ source: "skeleton-overlay", type: "drop-target", target: null, seq: 0 });
        break;
    }
    this.schedule();
  }

  /**
   * Where a drop at (x, y) lands: the innermost drop container at the point (never
   * the node being moved or anything inside it), and the index among its children
   * from their rendered positions along the container's flow. Near that container's
   * edge, along its parent's flow, the drop goes beside it in the parent instead
   * (F-1, F-4, see besideAt), if the parent takes drops too.
   */
  private dropAt(x: number, y: number, moving: string | null): DropState | null {
    if (!this.index || !this.doc.body) return null;
    const at = deepestAt(this.pointAt(x, y), x, y);
    if (!at || at === this.layer) return null;
    const hit = this.index.hit(at);
    const inMoving = (key: string) => moving !== null && (key === moving || key.startsWith(`${moving}.`));
    for (let key: string | null = hit?.key ?? null; key !== null; key = parentKeyOf(key)) {
      const node = this.node(key);
      if (!node?.drop || inMoving(key)) continue;
      const inside = this.layoutOf(node, moving);
      if (!inside) continue;
      const beside = this.besideAt(key, inside, x, y, moving);
      if (beside) return beside;
      const index = dropIndex(inside.flow, inside.placed, x, y, inside.count);
      const { rect, fill } = indicatorRect(inside.flow, inside.container, inside.placed, index);
      return { parentKey: key, index, container: inside.container, indicator: rect, fill, beside: null };
    }
    return null;
  }

  /**
   * A drop beside the container at `key`, or beside one of its ancestors, innermost
   * first: their edges often coincide (a Card's header spans the Card's width, so its
   * right edge is the Card's). Each is judged in its own parent, which must take drops.
   */
  private besideAt(key: string, layout: Layout, x: number, y: number, moving: string | null): DropState | null {
    const inMoving = (k: string) => moving !== null && (k === moving || k.startsWith(`${moving}.`));
    let at = key;
    let own = layout;
    for (;;) {
      const parentKey = parentKeyOf(at);
      const parent = this.node(parentKey);
      if (parentKey === null || !parent?.drop || inMoving(parentKey)) return null;
      const outside = this.layoutOf(parent, moving);
      const child = outside?.placed.find((c) => c.key === at);
      if (!outside || !child) return null;
      const side = besideSide(outside.flow, { rect: own.container, flow: own.flow, children: own.placed.map((c) => c.rect) }, x, y);
      if (side) {
        const index = child.index + (side === "after" ? 1 : 0);
        const { rect } = indicatorRect(outside.flow, outside.container, outside.placed, index);
        return { parentKey, index, container: outside.container, indicator: rect, fill: false, beside: { key: at, side } };
      }
      at = parentKey;
      own = outside;
    }
  }

  /**
   * A drop container as rendered: its flow, its box, and its children's boxes. Indexes
   * count the children as they'll be once the moved node is taken out.
   */
  private layoutOf(node: OverlayNode, moving: string | null): Layout | null {
    if (!this.index || !this.doc.body) return null;
    const elements = this.index.elementsOf(node, this.doc.body, this.layer);
    const container = unionRect(elements.map(rectOf));
    if (!elements[0] || !container) return null;
    const style = this.options.win.getComputedStyle(elements[0]);
    const flow = flowOf(style.display, style.flexDirection, style.gridTemplateColumns);
    const placed: (PlacedChild & { key: string })[] = [];
    let count = 0;
    for (const child of this.index.nodes) {
      if (parentKeyOf(child.key) !== node.key || child.key === moving) continue;
      const rect = unionRect(this.rects(child));
      if (rect) placed.push({ index: count, rect, key: child.key });
      count++;
    }
    return { flow, container, placed, count };
  }

  private target(event: Event): OverlayNode | null {
    if (!this.index) return null;
    // Hit-test by position: browsers don't deliver mouse events to disabled form
    // controls, and elementFromPoint skips pointer-events: none (disabled shadcn
    // buttons), so descend from the hit to the deepest element at the point.
    const at =
      event instanceof MouseEvent && event.isTrusted
        ? deepestAt(this.pointAt(event.clientX, event.clientY), event.clientX, event.clientY)
        : null;
    const el = at ?? event.target;
    if (!(el instanceof Element) || el === this.layer) return null;
    return this.index.hit(el);
  }

  private onMove(event: MouseEvent): void {
    if (this.mode !== "select") return;
    if (this.gizmo) {
      // Chromium sends synthetic moves after layout changes (the live preview makes
      // them), without the pressed button. The drag ends on release or lost capture.
      if ((event.buttons & 1) !== 0) this.gizmoTo(event.clientX - this.gizmo.x, event.clientY - this.gizmo.y);
      return;
    }
    const handle = this.handleAt(event);
    const hover = handle ? { handle, scope: scopeOf(event) } : null;
    if (hover?.handle !== this.gizmoHover?.handle || hover?.scope !== this.gizmoHover?.scope) {
      this.gizmoHover = hover;
      this.schedule();
    }
    if (handle) {
      this.setHover(null);
      return;
    }
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

  /**
   * Keys in select mode: Escape cancels a move; Skeleton's shortcuts go to the host
   * (focus can be in this frame after a click), and never to the app.
   */
  private onKey(event: KeyboardEvent): void {
    // Typing in the text editor is text, not shortcuts (it handles Enter and Escape).
    if (this.textEditor && event.composedPath().includes(this.textEditor.input)) return;
    if (event.key === "Escape") {
      this.cancelMove();
      this.cancelGizmo();
    }
    // Shift and Alt change the scope the hover label shows (T4.5).
    if (this.gizmoHover && (event.key === "Shift" || event.key === "Alt")) {
      this.gizmoHover = { ...this.gizmoHover, scope: scopeOf(event) };
      this.schedule();
    }
    if (this.mode !== "select") return;
    const mod = event.ctrlKey || event.metaKey;
    if (!isShortcut(event.key, mod, event.altKey)) return;
    event.preventDefault();
    event.stopPropagation();
    this.post({ source: "skeleton-overlay", type: "key", key: event.key, mod, shift: event.shiftKey, alt: event.altKey });
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
        this.reportDrop(0);
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
  private reportDrop(seq: number): void {
    if (this.moving !== null || !this.hostDragging) return;
    const target = this.drop ? { parentKey: this.drop.parentKey, index: this.drop.index } : null;
    this.post({ source: "skeleton-overlay", type: "drop-target", target, seq });
  }

  private onPointer(event: Event): void {
    if (this.mode !== "select" || this.passClick) return;
    // The text editor is Skeleton's own field: it takes its clicks (caret, selection).
    if (this.textEditor && event.composedPath().includes(this.textEditor.input)) return;
    // In select mode the app never sees the pointer (so buttons don't fire and
    // menus don't open); a click selects instead.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (this.onPinPointer(event)) return;
    if (this.onGizmoPointer(event)) return;
    if (event.type === "pointerdown" && event instanceof MouseEvent && event.button === 0) {
      // The selection's label is its grip: it moves the selected node itself, which a
      // press on its content can't when children cover it (a Table, T5 gate).
      this.press = { x: event.clientX, y: event.clientY, key: this.grabAt(event) ?? this.movableFrom(this.target(event)) };
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
        // Where it's released, not where the last move was.
        if (event instanceof MouseEvent) this.drop = this.dropAt(event.clientX, event.clientY, this.moving);
        const target = this.drop ? { parentKey: this.drop.parentKey, index: this.drop.index } : null;
        if (target) this.post({ source: "skeleton-overlay", type: "move", key: this.moving, target });
        this.swallowClick = true;
      }
      this.press = null;
      this.moving = null;
      this.endDrag();
      return;
    }
    if (event.type === "dblclick") {
      const node = this.target(event);
      if (node) this.post({ source: "skeleton-overlay", type: "text-request", key: node.key });
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

  /**
   * The app's element at a point, looking through Skeleton's own drawing layer: the
   * grip label, pins and handles take pointer events, and must never hide what's under
   * them from a click, a hover or a drop.
   */
  private pointAt(x: number, y: number): Element | null {
    const top = this.doc.elementFromPoint(x, y);
    if (top !== this.layer || typeof this.doc.elementsFromPoint !== "function") return top;
    return this.doc.elementsFromPoint(x, y).find((el) => el !== this.layer) ?? null;
  }

  /** The key of the selected node when the event is on its label (its grip), else null. */
  private grabAt(event: Event): string | null {
    const hit = event.composedPath()[0];
    if (!(hit instanceof Element)) return null;
    const key = hit.getAttribute("data-grab");
    return key !== null && key === this.selected && this.node(key)?.move ? key : null;
  }

  /** A click on a note pin (T5.1) goes to the host. True when the event was on a pin. */
  private onPinPointer(event: Event): boolean {
    const hit = event.composedPath()[0];
    if (!(hit instanceof Element)) return false;
    const key = hit.closest("[data-pin]")?.getAttribute("data-pin");
    if (!key) return false;
    if (event.type === "click") this.post({ source: "skeleton-overlay", type: "pin", key });
    return true;
  }

  /** Presses on handles and chips (T4.3). True when the event was a gizmo's. */
  private onGizmoPointer(event: Event): boolean {
    if (!(event instanceof MouseEvent)) return false;
    if (this.gizmo) {
      if (event.type === "pointerup") this.releaseGizmo();
      return true;
    }
    // The click that ends a gizmo drag selects nothing, wherever it lands.
    if (event.type === "click" && this.swallowClick) {
      this.swallowClick = false;
      return true;
    }
    const chip = this.chipAt(event);
    if (chip) {
      if (event.type === "click" && this.selected) {
        this.post({ source: "skeleton-overlay", type: "colour-chip", key: this.selected, utility: chip.utility, token: chip.token, alt: event.altKey });
      }
      return true;
    }
    const handle = this.handleAt(event);
    if (!handle) return false;
    if (event.type === "pointerdown" && event.button === 0) this.startGizmo(handle, event);
    return true;
  }

  private startGizmo(handle: Handle, event: MouseEvent): void {
    const data = this.gizmoData;
    const el = this.selectedElement();
    if (!data || !el || data.key !== this.selected) return;
    const scope = scopeOf(event);
    const m = this.measure(el, this.node(this.selected));
    const plan = planDrag(handle, scope, m, data);
    if ("unavailable" in plan) {
      this.gizmoRefusal = { text: `Can't: ${plan.unavailable}`, x: handle.rect.x, y: handle.rect.y, until: Date.now() + 2500 };
      this.schedule();
      this.options.win.setTimeout(() => this.schedule(), 2600);
      return;
    }
    this.clearLive();
    const count = plan.token && this.tokens && this.doc.body ? this.tokens.elements(this.doc.body, this.layer, plan.token).length : 1;
    const start = plan.valueAt(0, 0);
    this.gizmo = { key: data.key, handle, scope, drag: plan, x: event.clientX, y: event.clientY, start, value: start, text: plan.at(start).text, commit: null, count };
    this.setHover(null);
    // Keep receiving the drag's moves and release even outside the frame. The handle
    // itself is redrawn every frame, so the capture goes on the document element.
    if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent) {
      try {
        this.doc.documentElement.setPointerCapture(event.pointerId);
      } catch (error) {
        console.warn("[skeleton overlay] couldn't capture the pointer", error);
      }
    }
    this.schedule();
  }

  /** The gizmo moved by (dx, dy): preview the new value everywhere it applies (T4.4). */
  private gizmoTo(dx: number, dy: number): void {
    const g = this.gizmo;
    if (!g) return;
    const value = g.drag.valueAt(dx, dy);
    if (value === g.value && g.commit !== null) return;
    const { css, commit, text } = g.drag.at(value);
    g.value = value;
    g.text = text;
    g.commit = value === g.start ? null : commit;
    this.preview(css);
    this.schedule();
  }

  private releaseGizmo(): void {
    const g = this.gizmo;
    this.gizmo = null;
    this.swallowClick = true;
    if (!g || !g.commit) {
      this.clearLive();
    } else {
      if (this.live) this.live.pending = true;
      // Nothing may arrive (a write refused before any update): don't keep a stale preview.
      this.settleLive(LIVE_SETTLE_MS * 2);
      this.post({ source: "skeleton-overlay", type: "gizmo-commit", key: g.key, commit: g.commit });
    }
    this.schedule();
  }

  private cancelGizmo(): void {
    if (!this.gizmo) return;
    this.gizmo = null;
    this.clearLive();
    this.schedule();
  }

  /** Show `css` on the page, with the selected element marked as the instance target. */
  private preview(css: string): void {
    const target = this.selectedElement();
    if (!target) return;
    if (!this.live || this.live.target !== target) {
      this.clearLive();
      const style = this.doc.createElement("style");
      style.setAttribute("data-skeleton-live", "");
      this.doc.head.appendChild(style);
      target.setAttribute(LIVE_TARGET, "");
      this.live = { style, target, pending: false, timer: 0 };
    }
    this.live.style.textContent = css;
  }

  /** Take the preview away after `ms` (sooner calls win). */
  private settleLive(ms: number): void {
    const live = this.live;
    if (!live) return;
    if (live.timer) this.options.win.clearTimeout(live.timer);
    live.timer = this.options.win.setTimeout(() => {
      if (this.live === live) this.clearLive();
    }, ms);
  }

  private clearLive(): void {
    const live = this.live;
    if (!live) return;
    this.live = null;
    if (live.timer) this.options.win.clearTimeout(live.timer);
    live.style.remove();
    live.target.removeAttribute(LIVE_TARGET);
  }

  private selectedElement(): Element | null {
    const node = this.node(this.selected);
    if (!node || !this.index || !this.doc.body) return null;
    return this.index.elementsOf(node, this.doc.body, this.layer)[0] ?? null;
  }

  /** The handle an event is on: handles take pointer events inside the drawing layer. */
  private handleAt(event: Event): Handle | null {
    const hit = event.composedPath()[0];
    if (!(hit instanceof Element) || !hit.hasAttribute("data-gizmo")) return null;
    return this.handles[Number(hit.getAttribute("data-gizmo"))] ?? null;
  }

  private chipAt(event: Event): { utility: string; token: string } | null {
    const hit = event.composedPath()[0];
    if (!(hit instanceof Element)) return null;
    const utility = hit.getAttribute("data-chip");
    const token = hit.getAttribute("data-token");
    return utility && token ? { utility, token } : null;
  }

  /** What the gizmos need to know about an element's box and styles. */
  private measure(el: Element, node: OverlayNode | null): Measured {
    const win = this.options.win;
    const cs = win.getComputedStyle(el);
    const flow = flowOf(cs.display, cs.flexDirection, cs.gridTemplateColumns);
    const rowish = flow === "horizontal" || flow === "grid";
    const container = cs.display.includes("flex") || cs.display.includes("grid");
    const children = [...el.children].map(rectOf).filter((r) => r.width > 0 || r.height > 0);
    children.sort((a, b) => (rowish ? a.x - b.x : a.y - b.y));
    const r = rectOf(el);
    const gaps: Measured["gaps"] = [];
    for (let i = 1; i < children.length; i++) {
      const a = children[i - 1] as Rect;
      const b = children[i] as Rect;
      gaps.push(
        rowish
          ? { x: a.x + a.width, y: r.y, width: Math.max(0, b.x - a.x - a.width), height: r.height }
          : { x: r.x, y: a.y + a.height, width: r.width, height: Math.max(0, b.y - a.y - a.height) },
      );
    }
    const border = (side: string) => (cs.getPropertyValue(`border-${side}-style`) === "none" ? 0 : parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0);
    return {
      rect: r,
      container: node?.drop ?? false,
      classes: [...el.classList].filter((c) => stripVariants(c) === c).map((c) => c.replace(/^!|!$/g, "")),
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      flow: container ? (rowish ? "row" : "column") : null,
      gap: parseFloat(rowish ? cs.columnGap : cs.rowGap) || 0,
      padding: { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 },
      fontSize: parseFloat(cs.fontSize) || 16,
      hasText: [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== ""),
      borderWidth: Math.max(border("top"), border("right"), border("bottom"), border("left")),
      gaps,
      rem: parseFloat(win.getComputedStyle(this.doc.documentElement).fontSize) || 16,
    };
  }

  /** Colour utilities on the element that read a colour token: one chip each (T4.3). */
  private chipsFor(el: Element, classes: string[]): { utility: string; token: string; colour: string }[] {
    const data = this.gizmoData;
    if (!data) return [];
    const cs = this.options.win.getComputedStyle(el);
    const out: { utility: string; token: string; colour: string }[] = [];
    for (const c of classes) {
      const m = /^(bg|text|border)-([a-z0-9-]+?)(\/\d+)?$/.exec(c);
      if (!m) continue;
      const token = `--${m[2]}`;
      if (!data.tokens.some((t) => t.name === token && t.colour) || out.some((o) => o.utility === m[1])) continue;
      const prop = m[1] === "bg" ? "background-color" : m[1] === "text" ? "color" : "border-top-color";
      out.push({ utility: m[1] as string, token, colour: cs.getPropertyValue(prop) });
    }
    return out;
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

  /**
   * Edit the node's text in place (F-5): a field over the element, in its font, so the
   * app's own DOM is never touched (React owns it). Enter or leaving the field commits,
   * Escape cancels; the host writes it with setText.
   */
  private openTextEditor(key: string, text: string): void {
    this.closeTextEditor(false);
    const node = this.node(key);
    const el = node && this.index && this.doc.body ? this.index.elementsOf(node, this.doc.body, this.layer)[0] : undefined;
    if (!node || !el) return;
    const cs = this.options.win.getComputedStyle(el);
    const input = this.doc.createElement("input");
    input.type = "text";
    input.value = text;
    input.setAttribute("data-text-editor", "");
    input.setAttribute("aria-label", `Text of ${labelOf(node)}`);
    input.style.cssText =
      `position:fixed;box-sizing:border-box;margin:0;pointer-events:auto;z-index:1;` +
      `font:${cs.font};letter-spacing:${cs.letterSpacing};text-align:${cs.textAlign};color:${cs.color};` +
      `padding:${cs.padding};background:Canvas;border:0;border-radius:2px;outline:2px solid ${COLORS.selected};outline-offset:0`;
    this.textEditor = { key, input, original: text };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.closeTextEditor(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeTextEditor(false);
      }
    });
    input.addEventListener("blur", () => this.closeTextEditor(true));
    this.shadow.appendChild(input);
    this.placeTextEditor();
    input.focus();
    input.select();
  }

  /** Keep the editor over its element as the page scrolls or reflows. */
  private placeTextEditor(): void {
    const editor = this.textEditor;
    if (!editor) return;
    const node = this.node(editor.key);
    const rect = node ? unionRect(this.rects(node)) : null;
    if (!rect) return;
    const s = editor.input.style;
    s.left = `${rect.x}px`;
    s.top = `${rect.y}px`;
    s.width = `${Math.max(rect.width, 80)}px`;
    s.height = `${rect.height}px`;
  }

  private closeTextEditor(commit: boolean): void {
    const editor = this.textEditor;
    if (!editor) return;
    this.textEditor = null;
    const text = editor.input.value;
    editor.input.remove();
    if (commit && text !== editor.original) this.post({ source: "skeleton-overlay", type: "text-commit", key: editor.key, text });
  }

  /** The trigger of the Dialog or Sheet at `key` (Radix marks it), if it's on screen. */
  private triggerOf(key: string): HTMLElement | null {
    const node = this.node(key);
    if (!node || !this.index || !this.doc.body) return null;
    for (const el of this.index.elementsOf(node, this.doc.body, this.layer)) {
      const trigger = el.matches(DIALOG_TRIGGER) ? el : el.querySelector(DIALOG_TRIGGER);
      if (trigger instanceof HTMLElement) return trigger;
    }
    return null;
  }

  /** Open or close a Dialog or Sheet the way the app would: by clicking its trigger (F-6). */
  private setOpen(key: string, open: boolean): void {
    const trigger = this.triggerOf(key);
    if (!trigger || (trigger.getAttribute("aria-expanded") === "true") === open) return;
    this.passClick = true;
    try {
      trigger.click();
    } finally {
      this.passClick = false;
    }
  }

  /** Tell the host whether the watched Dialog or Sheet is open, if that changed. */
  private reportOpen(): void {
    const key = this.openWatch;
    if (key === null || !this.index) return;
    const trigger = this.triggerOf(key);
    const open = trigger ? trigger.getAttribute("aria-expanded") === "true" : null;
    const signature = `${this.index.version} ${key} ${open}`;
    if (signature === this.lastOpen) return;
    this.lastOpen = signature;
    this.post({ source: "skeleton-overlay", type: "open-state", key, open });
  }

  /** Tell the host what each token affects now, if that changed. */
  private reportCounts(): void {
    if (!this.tokens || !this.doc.body) return;
    const counts = this.tokens.count(this.doc.body, this.layer);
    const key = JSON.stringify(counts);
    if (key === this.lastCounts) return;
    this.lastCounts = key;
    this.post({ source: "skeleton-overlay", type: "token-counts", counts });
  }

  private draw(): void {
    if (this.remap) {
      if (this.index) this.reportMapped(false);
      this.reportCounts();
      this.reportOpen();
      this.remap = false;
    }
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
    const box = (node: OverlayNode, color: string, width: number, dashed: boolean, label: boolean, grip = false) => {
      const rects = this.rects(node);
      rects.forEach((r, i) => {
        parts.push(
          `<div class="box" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;` +
            `border:${width}px ${dashed ? "dashed" : "solid"} ${color}"></div>`,
        );
        if (label && i === 0) {
          const text = labelOf(node);
          const at = place(r.x, r.y >= 18 ? r.y - 18 : r.y + r.height, text);
          const grab = grip ? ` data-grab="${escapeHtml(node.key)}" title="Drag to move"` : "";
          parts.push(`<div class="label"${grab} style="left:${at.x}px;top:${at.y}px;background:${color}">${grip ? "⠿ " : ""}${escapeHtml(text)}</div>`);
        }
      });
    };
    // Everything a hovered token affects (T4.2), under everything else.
    if (this.tokens && this.tokenHighlight && this.doc.body) {
      for (const el of this.tokens.elements(this.doc.body, this.layer, this.tokenHighlight)) {
        const r = rectOf(el);
        if (r.width === 0 && r.height === 0) continue;
        parts.push(`<div class="box" data-token-box style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;border:1px solid ${COLORS.token}"></div>`);
      }
    }
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
    const grip = selected !== null && selected.move && this.mode === "select" && this.moving === null;
    if (selected) box(selected, selected.kind === "locked" ? COLORS.locked : COLORS.selected, 2, selected.kind === "locked", true, grip);
    this.drawPins(parts);
    this.drawGizmos(parts, place);
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
      const besideNode = drop.beside ? this.node(drop.beside.key) : null;
      const where =
        drop.beside && besideNode
          ? `${drop.beside.side === "before" ? "before" : "after"} ${labelOf(besideNode)} in ${labelOf(dropNode)}`
          : `into ${labelOf(dropNode)}`;
      const text = moved ? `Move ${labelOf(moved)} ${where}` : where.charAt(0).toUpperCase() + where.slice(1);
      const at = place(c.x, c.y >= 18 ? c.y - 18 : c.y, text);
      parts.push(`<div class="label" style="left:${at.x}px;top:${at.y}px;background:${COLORS.drop}">${escapeHtml(text)}</div>`);
    }
    this.placeTextEditor();
    this.drawn.innerHTML =
      `<style>.box{position:fixed;box-sizing:border-box;pointer-events:none}` +
      `.label{position:fixed;font:11px/18px system-ui,sans-serif;color:#fff;padding:0 6px;border-radius:3px;white-space:nowrap}` +
      `.label[data-grab]{pointer-events:auto;cursor:grab}` +
      `.gz{position:fixed;box-sizing:border-box;pointer-events:auto;background:#fff;border:2px solid ${COLORS.gizmo};border-radius:3px}` +
      `.gz[data-kind=radius]{border-radius:50%;cursor:nwse-resize}.gz[data-kind=gap],.gz[data-kind=padding]{cursor:move}` +
      `.gz[data-kind=type]{cursor:ns-resize}.gz[data-kind=border]{cursor:ew-resize}` +
      `.pin{position:fixed;box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;pointer-events:auto;cursor:pointer;border:2px solid #fff;border-radius:9px 9px 9px 2px;` +
      `font:bold 10px/14px system-ui,sans-serif;color:#fff;text-align:center;box-shadow:0 1px 3px rgb(0 0 0/.3)}` +
      `.chip{position:fixed;box-sizing:border-box;width:14px;height:14px;pointer-events:auto;cursor:pointer;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px ${COLORS.gizmo}}</style>` +
      parts.join("");
  }

  /** A pin at the top-right of each element with notes (T5.1), in select mode. */
  private drawPins(parts: string[]): void {
    if (this.mode !== "select") return;
    for (const pin of this.pins) {
      const node = this.node(pin.key);
      const r = node ? this.rects(node)[0] : undefined;
      if (!r) continue;
      const colour = pin.open === 0 ? PIN_COLOURS.resolved : PIN_COLOURS[pin.type];
      const text = pin.open > 0 ? String(pin.open) : pin.total > 0 ? "✓" : "";
      const notes = pin.total > 0 ? `${pin.open} open of ${pin.total} note${pin.total === 1 ? "" : "s"}` : "";
      const title = [notes, pin.replied ? "agent replied" : ""].filter(Boolean).join(" · ");
      const x = Math.max(0, r.x + r.width - 12);
      const y = Math.max(0, r.y - 10);
      parts.push(
        `<div class="pin" data-pin="${escapeHtml(pin.key)}" data-open="${pin.open}" title="${escapeHtml(title)}" style="left:${x}px;top:${y}px;background:${colour}">` +
          `${escapeHtml(text)}${pin.replied ? `${text ? "&thinsp;" : ""}↩` : ""}</div>`,
      );
    }
  }

  /** Handles and chips on the selected element (T4.3), and the drag's or hover's label (T4.5). */
  private drawGizmos(parts: string[], place: (x: number, y: number, text: string) => { x: number; y: number }): void {
    this.handles = [];
    const data = this.gizmoData;
    const busy = this.moving !== null || this.drop !== null || this.hostDragging;
    const el = this.mode === "select" && !busy && data && data.key === this.selected ? this.selectedElement() : null;
    if (!el) return;
    const m = this.measure(el, this.node(this.selected));
    const g = this.gizmo;
    this.handles = g ? [g.handle] : handlesFor(m);
    this.handles.forEach((h, i) => {
      const r = h.rect;
      parts.push(`<div class="gz" data-gizmo="${i}" data-kind="${h.kind}" data-part="${h.part ?? ""}" style="left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px"></div>`);
    });
    if (!g) {
      this.chipsFor(el, m.classes).forEach((chip, i) => {
        const x = m.rect.x + m.rect.width - 16 * (i + 1);
        const y = m.rect.y >= 18 ? m.rect.y - 16 : m.rect.y + 2;
        parts.push(
          `<div class="chip" data-chip="${chip.utility}" data-token="${escapeHtml(chip.token)}" title="${escapeHtml(`${chip.utility}: ${chip.token}`)}" ` +
            `style="left:${x}px;top:${y}px;background:${escapeHtml(chip.colour)}"></div>`,
        );
      });
    }
    const label = (x: number, y: number, text: string) => {
      const at = place(x, y, text);
      parts.push(`<div class="label" data-gizmo-label style="left:${at.x}px;top:${at.y}px;background:${COLORS.gizmo}">${escapeHtml(text)}</div>`);
    };
    if (g) {
      const affected = g.scope === "instance" || g.drag.token === null ? "this element" : `${g.count} element${g.count === 1 ? "" : "s"}`;
      label(g.handle.rect.x + 14, g.handle.rect.y + 12, `${g.text} · ${affected}`);
    } else if (this.gizmoHover) {
      const { handle, scope } = this.gizmoHover;
      const plan = planDrag(handle, scope, m, data as GizmoData);
      const what = "unavailable" in plan ? `can't: ${plan.unavailable}` : plan.label;
      label(handle.rect.x + 14, handle.rect.y + 12, `${SCOPE_NAMES[scope]}: ${what}`);
    }
    const refusal = this.gizmoRefusal;
    if (refusal && refusal.until > Date.now()) label(refusal.x + 14, refusal.y + 12, refusal.text);
    else this.gizmoRefusal = null;
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

/** What Radix renders a Dialog's or Sheet's trigger as. */
const DIALOG_TRIGGER = '[aria-haspopup="dialog"][aria-expanded]';

const PIN_COLOURS = { build: "#2563eb", behaviour: "#16a34a", question: "#d97706", resolved: "#71717a" };

/** How the hover label names each scope (PRD §10.3). */
const SCOPE_NAMES: Record<Scope, string> = { component: "Drag", global: "Shift", instance: "Alt" };

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
