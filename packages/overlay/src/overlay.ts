// The overlay (T2.2). Runs inside the user's app, injected by Skeleton's dev plugin.
// Draws hover/selection outlines and maps DOM ↔ source through NodeIndex. Talks to
// the host only via postMessage; never imports from core.

import { NodeIndex } from "./mapping.js";
import { isHostMessage, type HostMessage, type NodeBox, type OverlayMessage, type OverlayNode } from "./protocol.js";

type Rect = NodeBox["rects"][number];

const COLORS = {
  hover: "#3b82f6",
  selected: "#2563eb",
  locked: "#ea580c",
};

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
    win.addEventListener("mousemove", (e) => this.onMove(e), { capture: true, signal });
    this.doc.addEventListener("mouseleave", () => this.setHover(null), { signal });
    this.observer = new MutationObserver(() => {
      this.index?.invalidate();
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
        this.index = new NodeIndex(msg.file, msg.nodes);
        if (this.selected && !msg.nodes.some((n) => n.key === this.selected)) this.selected = null;
        this.post({ source: "skeleton-overlay", type: "mapped", boxes: this.boxes() });
        break;
      case "select":
        this.selected = msg.key;
        this.scrollIntoView(msg.key);
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
    }
    this.schedule();
  }

  private target(event: Event): OverlayNode | null {
    const el = event.target;
    if (!this.index || !(el instanceof Element) || el === this.layer) return null;
    return this.index.hit(el);
  }

  private onMove(event: MouseEvent): void {
    if (this.mode !== "select") return;
    this.setHover(this.target(event)?.key ?? null);
  }

  private onPointer(event: Event): void {
    if (this.mode !== "select") return;
    // In select mode the app never sees the pointer (so buttons don't fire and
    // menus don't open); a click selects instead.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type !== "click") return;
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
    return this.index.elementsOf(node, this.doc.body, this.layer).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
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

  private draw(): void {
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
