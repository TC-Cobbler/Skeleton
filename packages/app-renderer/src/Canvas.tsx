import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DevServerStatus } from "@skeleton/app-main/ipc";
import {
  isOverlayMessage,
  type HostMessage,
  type NodeBox,
  type OverlayMessage,
  type OverlayNode,
} from "@skeleton/overlay/protocol";

export type PreviewWidth = "desktop" | "tablet" | "mobile";
export type PreviewLayout = PreviewWidth | "side-by-side";

export const WIDTHS: Record<PreviewWidth, number> = { desktop: 1280, tablet: 768, mobile: 390 };

export interface CanvasEvents {
  onHover?: (key: string | null) => void;
  onSelect?: (key: string | null) => void;
  /** Vite applied an update: the page should be re-parsed. */
  onUpdated?: () => void;
  onLocation?: (pathname: string) => void;
  onMapped?: (boxes: NodeBox[]) => void;
}

export interface CanvasProps extends CanvasEvents {
  status: DevServerStatus | null;
  /** Page file the nodes belong to, project-relative. */
  file: string | null;
  nodes: OverlayNode[];
  selected: string | null;
  highlighted: string | null;
  mode: "select" | "interact";
  /** Point the app at this path; a new object navigates even to the same path. */
  navigate: { path: string } | null;
  layout: PreviewLayout;
  /** Preview the app in dark mode (T2.8). */
  dark: boolean;
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
    <div className={`canvas canvas-${layout === "side-by-side" ? "multi" : "single"}`}>
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
    const { file, nodes } = latest.current;
    if (file) post({ source: "skeleton-host", type: "tree", file, nodes });
  };

  useEffect(() => {
    ready.current = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (!isOverlayMessage(event.data)) return;
      const msg: OverlayMessage = event.data;
      const p = latest.current;
      switch (msg.type) {
        case "ready":
          ready.current = true;
          sendTree();
          post({ source: "skeleton-host", type: "mode", mode: p.mode });
          post({ source: "skeleton-host", type: "theme", dark: p.dark });
          post({ source: "skeleton-host", type: "select", key: p.selected });
          p.onLocation?.(msg.pathname);
          break;
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
          if (p.primary) p.onMapped?.(msg.boxes);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  useEffect(sendTree, [props.file, props.nodes]);
  useEffect(() => post({ source: "skeleton-host", type: "select", key: props.selected }), [props.selected]);
  useEffect(() => post({ source: "skeleton-host", type: "highlight", key: props.highlighted }), [props.highlighted]);
  useEffect(() => post({ source: "skeleton-host", type: "mode", mode: props.mode }), [props.mode]);
  useEffect(() => post({ source: "skeleton-host", type: "theme", dark: props.dark }), [props.dark]);
  useEffect(() => {
    const target = props.navigate ? new URL(props.navigate.path, origin).href : null;
    if (!target || !frame.current || frame.current.src === target) return;
    ready.current = false;
    frame.current.src = target;
  }, [props.navigate]);

  return (
    <div
      ref={box}
      className="frame"
      data-testid={`canvas-${width}`}
      style={{ width: pixels * scale }}
    >
      <div className="frame-label muted">
        {width} · {pixels}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
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
