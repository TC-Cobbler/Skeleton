import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DevServerStatus } from "@skeleton/app-main/ipc";
import {
  isOverlayMessage,
  type DropTarget,
  type GizmoCommit,
  type GizmoToken,
  type HostMessage,
  type NodeBox,
  type OverlayMessage,
  type OverlayNode,
  type TokenUsage,
} from "@skeleton/overlay/protocol";

export type PreviewWidth = "desktop" | "tablet" | "mobile";
export type PreviewLayout = PreviewWidth | "side-by-side";

export const WIDTHS: Record<PreviewWidth, number> = { desktop: 1280, tablet: 768, mobile: 390 };

/** How long after Skeleton navigates the canvas it corrects a stray document load (see "ready"). */
const NAVIGATION_GRACE_MS = 3000;

export interface CanvasEvents {
  onHover?: (key: string | null) => void;
  onSelect?: (key: string | null) => void;
  /** Vite applied an update: the page should be re-parsed. */
  onUpdated?: () => void;
  onLocation?: (pathname: string) => void;
  /** What's on screen, for the tree at `version` (see the overlay's `mapped` message). */
  onMapped?: (boxes: NodeBox[], version: string) => void;
  /** Where the current drag would land in a frame (null: nowhere in it). */
  onDropTarget?: (frame: PreviewWidth, target: DropTarget | null, seq: number) => void;
  /** A node was dragged to a new place on the canvas (T3.3). */
  onMove?: (key: string, target: DropTarget) => void;
  /** A Skeleton shortcut pressed while the canvas had focus. */
  onKey?: (key: string, mod: boolean, shift: boolean) => void;
  /** How many elements on the page each token affects (T4.2), while `tokenUsage` is set. */
  onTokenCounts?: (counts: Record<string, number>) => void;
  /** A gizmo drag was released (T4.4): write this, then answer through `gizmoDone`. */
  onGizmoCommit?: (key: string, commit: GizmoCommit) => void;
  /** A colour chip was clicked (T4.3). */
  onColourChip?: (chip: { key: string; utility: string; token: string; alt: boolean }) => void;
}

/** What the selected element's gizmos can do (T4.3). */
export interface GizmoContext {
  key: string;
  tokens: GizmoToken[];
  spacingSteps: number[];
  classEdits: string | null;
}

/** A drag in progress over the canvas, in window coordinates (T3.2). */
export interface CanvasDrag {
  clientX: number;
  clientY: number;
  /** The position's number, echoed in the frames' answers. */
  seq: number;
  /** Key of the node being moved, or null for a new element. */
  moving: string | null;
}

export interface CanvasProps extends CanvasEvents {
  status: DevServerStatus | null;
  /** Page file the nodes belong to, project-relative. */
  file: string | null;
  /** sourceVersion of the file text the nodes were parsed from. */
  version: string | null;
  nodes: OverlayNode[];
  selected: string | null;
  highlighted: string | null;
  mode: "select" | "interact";
  /** Point the app at this path; a new object navigates even to the same path. */
  navigate: { path: string } | null;
  layout: PreviewLayout;
  /** Preview the app in dark mode (T2.8). */
  dark: boolean;
  drag: CanvasDrag | null;
  /** The app on screen is mapped to the tree at `version` (null while catching up with an edit). */
  synced: boolean;
  /** What each token affects, to count on the page (T4.2); null when nobody's looking. */
  tokenUsage: Record<string, TokenUsage> | null;
  /** Outline everything this token affects. */
  tokenHighlight: string | null;
  gizmos: GizmoContext | null;
  /** How the last gizmo commit went; a new object is sent to the frames. */
  gizmoDone: { ok: boolean } | null;
  /** CSS to preview on the page (the colour picker), or null. */
  preview: string | null;
}

/**
 * The user's running app, embedded from its dev server (T2.1) at one or three
 * preview widths (T2.7), each with Skeleton's overlay inside (T2.2).
 */
export function Canvas(props: CanvasProps) {
  const { status, layout } = props;
  const url = status?.state === "running" ? status.url : null;
  const [follow, setFollow] = useState<{ path: string; from: PreviewWidth } | null>(null);

  if (!url) {
    const state = status?.state ?? "stopped";
    const message: Record<string, string> = {
      starting: "Starting the dev server…",
      installing: "Installing dependencies…",
      stopped: "The dev server isn't running.",
      crashed: "The dev server stopped unexpectedly. See the log below.",
      failed: "The dev server couldn't start. See the log below.",
    };
    return (
      <div className="canvas canvas-empty" data-testid="canvas-empty">
        <p className={state === "crashed" || state === "failed" ? "error" : "muted"}>{message[state]}</p>
      </div>
    );
  }

  const widths: PreviewWidth[] = layout === "side-by-side" ? ["desktop", "tablet", "mobile"] : [layout];
  const primary = widths[0] as PreviewWidth;
  return (
    <div className={`canvas canvas-${layout === "side-by-side" ? "multi" : "single"}${props.drag ? " is-dragging" : ""}`}>
      {widths.map((w) => (
        <CanvasFrame
          key={w}
          {...props}
          url={url}
          width={w}
          // Shares proportional to width, so every frame renders at the same scale.
          fit={WIDTHS[w] / widths.reduce((sum, x) => sum + WIDTHS[x], 0)}
          gaps={widths.length}
          primary={w === primary}
          // In side-by-side, a navigation inside one frame is followed by the others.
          navigate={follow && follow.from !== w ? follow : props.navigate}
          onLocation={(pathname) => {
            if (w === primary) props.onLocation?.(pathname);
            if (widths.length > 1) setFollow({ path: pathname, from: w });
          }}
        />
      ))}
    </div>
  );
}

interface FrameProps extends Omit<CanvasProps, "status" | "layout"> {
  url: string;
  width: PreviewWidth;
  /** Share of the canvas width this frame may use. */
  fit: number;
  /** Frames sharing the row (for gap allowance). */
  gaps: number;
  /** The frame whose updates, mapping and location drive the rest of the UI. */
  primary: boolean;
}

/**
 * One sandboxed iframe on the dev server (ADR 006): it can't navigate Skeleton's
 * window and has no bridge into main. Messages are accepted only from this iframe
 * and the dev server's origin.
 */
function CanvasFrame(props: FrameProps) {
  const { url, width, fit, gaps } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const origin = new URL(url).origin;
  const [scale, setScale] = useState(1);
  const pixels = WIDTHS[width];

  // Scale the frame down (never up) to fit its share of the canvas.
  useLayoutEffect(() => {
    const parent = box.current?.parentElement;
    if (!parent) return;
    // 16px canvas padding plus 16px between frames, shared out like the width.
    // Ignore sub-pixel changes so layout can't feed back into itself.
    const measure = () => {
      const next = Math.min(1, ((parent.clientWidth - 16 - 16 * (gaps - 1)) * fit - 2) / pixels);
      setScale((prev) => (Math.abs(prev - next) * pixels < 1 ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fit, gaps, pixels]);

  const post = (message: HostMessage) => {
    const win = frame.current?.contentWindow;
    if (win && ready.current) win.postMessage(message, origin);
  };
  const sendTree = () => {
    const { file, version, nodes } = latest.current;
    if (file && version) post({ source: "skeleton-host", type: "tree", file, version, nodes });
  };

  useEffect(() => {
    ready.current = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (!isOverlayMessage(event.data)) return;
      const msg: OverlayMessage = event.data;
      const p = latest.current;
      switch (msg.type) {
        case "ready": {
          // A page op changes the router, and Vite reloads the *old* document. That reload
          // can cancel Skeleton's navigation, or land after it and take the frame back.
          // So for a few seconds after a navigation, a document that loads somewhere else
          // is sent where Skeleton wanted it. (In-app navigation doesn't load a document,
          // so it's never overridden.) Re-setting `src` to its current value wouldn't
          // navigate, so the app is asked.
          const want = pending.current;
          if (want && Date.now() > want.until) pending.current = null;
          else if (want && msg.pathname !== want.path && want.tries < 5) {
            want.tries++;
            frame.current?.contentWindow?.postMessage({ source: "skeleton-host", type: "navigate", path: want.path } satisfies HostMessage, origin);
            break;
          }
          ready.current = true;
          sendTree();
          post({ source: "skeleton-host", type: "mode", mode: p.mode });
          post({ source: "skeleton-host", type: "theme", dark: p.dark });
          post({ source: "skeleton-host", type: "select", key: p.selected });
          post({ source: "skeleton-host", type: "token-usage", usage: p.primary ? p.tokenUsage : null });
          post({ source: "skeleton-host", type: "token-highlight", name: p.tokenHighlight });
          if (p.gizmos) post({ source: "skeleton-host", type: "gizmos", ...p.gizmos });
          p.onLocation?.(msg.pathname);
          break;
        }
        case "hover":
          p.onHover?.(msg.key);
          break;
        case "select":
          p.onSelect?.(msg.key);
          break;
        case "updated":
          if (p.primary) p.onUpdated?.();
          break;
        case "location":
          p.onLocation?.(msg.pathname);
          break;
        case "mapped":
          if (p.primary) p.onMapped?.(msg.boxes, msg.version);
          break;
        case "drop-target":
          p.onDropTarget?.(p.width, msg.target, msg.seq);
          break;
        case "move":
          p.onMove?.(msg.key, msg.target);
          break;
        case "key":
          p.onKey?.(msg.key, msg.mod, msg.shift);
          break;
        case "token-counts":
          if (p.primary) p.onTokenCounts?.(msg.counts);
          break;
        case "gizmo-commit":
          p.onGizmoCommit?.(msg.key, msg.commit);
          break;
        case "colour-chip":
          p.onColourChip?.({ key: msg.key, utility: msg.utility, token: msg.token, alt: msg.alt });
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  useEffect(sendTree, [props.file, props.version, props.nodes]);
  useEffect(() => post({ source: "skeleton-host", type: "select", key: props.selected }), [props.selected]);
  useEffect(() => post({ source: "skeleton-host", type: "highlight", key: props.highlighted }), [props.highlighted]);
  useEffect(() => post({ source: "skeleton-host", type: "mode", mode: props.mode }), [props.mode]);
  useEffect(() => post({ source: "skeleton-host", type: "theme", dark: props.dark }), [props.dark]);
  // Only the primary frame counts; the others just outline.
  useEffect(() => post({ source: "skeleton-host", type: "token-usage", usage: props.primary ? props.tokenUsage : null }), [props.tokenUsage, props.primary]);
  useEffect(() => post({ source: "skeleton-host", type: "token-highlight", name: props.tokenHighlight }), [props.tokenHighlight]);
  useEffect(() => {
    if (props.gizmos) post({ source: "skeleton-host", type: "gizmos", ...props.gizmos });
  }, [props.gizmos]);
  useEffect(() => {
    if (props.gizmoDone) post({ source: "skeleton-host", type: "gizmo-done", ok: props.gizmoDone.ok });
  }, [props.gizmoDone]);
  useEffect(() => post({ source: "skeleton-host", type: "preview", css: props.preview }), [props.preview]);
  // Escape cancels any drag, including a move inside the frame: keyboard focus stays in
  // Skeleton's window, so the overlay doesn't see the key itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") post({ source: "skeleton-host", type: "drag-end" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [origin]);

  // Forward a drag over this frame to its overlay, in the frame's own (unscaled)
  // coordinates. The iframe ignores the pointer during a drag (see .is-dragging).
  const dragInside = useRef(false);
  useEffect(() => {
    const drag = props.drag;
    const iframe = frame.current;
    const r = iframe?.getBoundingClientRect();
    const inside = !!drag && !!r && drag.clientX >= r.left && drag.clientX < r.right && drag.clientY >= r.top && drag.clientY < r.bottom;
    if (!inside || !drag || !iframe || !r) {
      if (dragInside.current) post({ source: "skeleton-host", type: "drag-end" });
      dragInside.current = false;
      // Not over this frame: answer for it straight away.
      if (drag) latest.current.onDropTarget?.(width, null, drag.seq);
      return;
    }
    dragInside.current = true;
    const cs = getComputedStyle(iframe);
    const x = (drag.clientX - r.left) / scale - parseFloat(cs.borderLeftWidth);
    const y = (drag.clientY - r.top) / scale - parseFloat(cs.borderTopWidth);
    post({ source: "skeleton-host", type: "drag", x, y, moving: drag.moving, seq: drag.seq });
  }, [props.drag]);

  const pending = useRef<{ path: string; tries: number; until: number } | null>(null);
  useEffect(() => {
    const target = props.navigate ? new URL(props.navigate.path, origin).href : null;
    if (!target || !props.navigate || !frame.current) return;
    pending.current = { path: props.navigate.path, tries: 0, until: Date.now() + NAVIGATION_GRACE_MS };
    if (frame.current.src === target) return;
    ready.current = false;
    frame.current.src = target;
  }, [props.navigate]);

  return (
    <div
      ref={box}
      className="frame"
      data-testid={`canvas-${width}`}
      data-version={props.synced && props.version ? props.version : undefined}
      style={{ width: pixels * scale }}
    >
      <div className="frame-label muted">
        {width} · {pixels}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        {!props.synced && " · updating…"}
      </div>
      <iframe
        ref={frame}
        title={`Preview (${width})`}
        data-testid={props.primary ? "canvas-frame" : `canvas-frame-${width}`}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        // CSS zoom, not transform: Chromium intermittently drops input to a
        // transformed cross-origin iframe (see docs/decisions/006-canvas.md).
        // Under zoom, % heights are unscaled but px are scaled, which matches the zoomed 20px top.
        style={{ width: pixels, height: "calc(100% - 20px)", zoom: scale }}
      />
    </div>
  );
}
