import { useCallback, useEffect, useRef, useState } from "react";
import type { DropTarget } from "@skeleton/overlay/protocol";

/** What's being dragged onto the canvas. */
export type DragSource = { kind: "palette"; paletteId: string; label: string };

export interface DragState {
  source: DragSource;
  clientX: number;
  clientY: number;
}

/** Pointer travel before a press becomes a drag. */
const THRESHOLD = 4;

/**
 * A pointer-driven drag from the sidebar onto the canvas (T3.2). The canvas frames
 * are cross-origin iframes, so while a drag is active they stop taking pointer events
 * (the canvas acts as a shield) and each frame forwards the pointer position to its
 * overlay, which answers with a drop target. Escape or leaving the window cancels.
 */
export function useCanvasDrag(onDrop: (source: DragSource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const targets = useRef(new Map<string, DropTarget | null>());
  const active = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const latestDrop = useRef(onDrop);
  latestDrop.current = onDrop;

  useEffect(() => () => cleanup.current?.(), []);

  const start = useCallback((source: DragSource, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanup.current?.();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const move = (e: PointerEvent) => {
      if (!active.current && Math.hypot(e.clientX - x0, e.clientY - y0) < THRESHOLD) return;
      active.current = true;
      setDrag({ source, clientX: e.clientX, clientY: e.clientY });
    };
    const finish = (commit: boolean) => {
      cleanup.current?.();
      const target = [...targets.current.values()].find((t) => t !== null) ?? null;
      const wasActive = active.current;
      active.current = false;
      targets.current.clear();
      setDrag(null);
      if (commit && wasActive && target) latestDrop.current(source, target);
    };
    const up = () => finish(true);
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish(false);
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      cleanup.current = null;
    };
  }, []);

  /** A frame's overlay reported where the drag would land (null: not in that frame). */
  const report = useCallback((frame: string, target: DropTarget | null) => {
    if (active.current) targets.current.set(frame, target);
  }, []);

  return { drag, start, report };
}
