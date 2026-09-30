import { useEffect, useRef } from "react";
import type { DevServerStatus } from "@skeleton/app-main/ipc";
import {
  isOverlayMessage,
  type HostMessage,
  type NodeBox,
  type OverlayMessage,
  type OverlayNode,
} from "@skeleton/overlay/protocol";

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
}

/**
 * The user's running app, embedded from its dev server (T2.1), with Skeleton's
 * overlay inside it (T2.2). A sandboxed iframe: it can't navigate Skeleton's window,
 * and the preload bridge only exists in the top frame, so the app has no way into
 * main. Messages are accepted only from this iframe and the dev server's origin
 * (ADR 006).
 */
export function Canvas(props: CanvasProps) {
  const { status } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const url = status?.state === "running" ? status.url : null;
  const origin = url ? new URL(url).origin : null;

  const post = (message: HostMessage) => {
    const win = frame.current?.contentWindow;
    if (win && origin && ready.current) win.postMessage(message, origin);
  };
  const sendTree = () => {
    const { file, nodes } = latest.current;
    if (file) post({ source: "skeleton-host", type: "tree", file, nodes });
  };

  useEffect(() => {
    if (!origin) return;
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
          p.onUpdated?.();
          break;
        case "location":
          p.onLocation?.(msg.pathname);
          break;
        case "mapped":
          p.onMapped?.(msg.boxes);
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

  if (url) {
    return (
      <div className="canvas">
        <iframe
          ref={frame}
          title="Preview"
          data-testid="canvas-frame"
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        />
      </div>
    );
  }
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
