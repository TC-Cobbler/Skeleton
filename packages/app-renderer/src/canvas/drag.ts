import { useCallback, useEffect, useRef, useState } from "react";
import type { DropTarget } from "@skeleton/overlay/protocol";

/** What's being dragged onto the canvas. */
export type DragSource = { kind: "palette"; paletteId: string; label: string };

export interface DragState {
  source: DragSource;
  clientX: number;
  clientY: number;
  /** Numbers each position; frames answer with the position's number (see `report`). */
  seq: number;
}

/** Pointer travel before a press becomes a drag. */
const THRESHOLD = 4;
/** How long a release waits for the frames to say where the final position lands. */
const RELEASE_WAIT_MS = 500;

/**
 * A pointer-driven drag from the sidebar onto the canvas (T3.2). The canvas frames
 * are cross-origin iframes, so while a drag is active they stop taking pointer events
 * (the canvas acts as a shield) and each frame forwards the pointer position to its
 * overlay, which answers with a drop target. Escape or leaving the window cancels.
 *
 * Answers lag the pointer, so a release doesn't trust the latest answer: it sends the
 * release position and drops only on an answer for that position. If none arrives in
 * time, nothing is dropped: a missed drop is better than a wrong one.
 */
export function useCanvasDrag(onDrop: (source: DragSource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const answers = useRef(new Map<string, { target: DropTarget | null; seq: number }>());
  const active = useRef(false);
  const seq = useRef(0);
  const release = useRef<{ seq: number; settle: () => void } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const latestDrop = useRef(onDrop);
  latestDrop.current = onDrop;

  useEffect(() => () => cleanup.current?.(), []);

  /** The target for position `want`, once every frame that answered has answered it. */
  const settled = (want: number): { done: boolean; target: DropTarget | null } => {
    const current = [...answers.current.values()].filter((a) => a.seq >= want);
    const hit = current.find((a) => a.target !== null);
    if (hit) return { done: true, target: hit.target };
    return { done: answers.current.size > 0 && current.length === answers.current.size, target: null };
  };

  const start = useCallback((source: DragSource, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanup.current?.();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const reset = () => {
      active.current = false;
      release.current = null;
      answers.current.clear();
      setDrag(null);
    };
    const move = (e: PointerEvent) => {
      if (release.current) return;
      if (!active.current && Math.hypot(e.clientX - x0, e.clientY - y0) < THRESHOLD) return;
      active.current = true;
      setDrag({ source, clientX: e.clientX, clientY: e.clientY, seq: ++seq.current });
    };
    const up = (e: PointerEvent) => {
      cleanup.current?.();
      if (!active.current) return reset();
      const want = ++seq.current;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const settle = () => {
        if (timer) clearTimeout(timer);
        const { target } = settled(want);
        reset();
        if (target) latestDrop.current(source, target);
      };
      release.current = { seq: want, settle };
      timer = setTimeout(settle, RELEASE_WAIT_MS);
      setDrag({ source, clientX: e.clientX, clientY: e.clientY, seq: want });
    };
    const cancel = () => {
      cleanup.current?.();
      reset();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && cancel();
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

  /** A frame says where position `seq` would land in it (null: not in that frame). */
  const report = useCallback((frame: string, target: DropTarget | null, at: number) => {
    if (!active.current || at === 0) return;
    const prev = answers.current.get(frame);
    if (prev && prev.seq > at) return;
    answers.current.set(frame, { target, seq: at });
    const pending = release.current;
    if (pending && settled(pending.seq).done) pending.settle();
  }, []);

  return { drag, start, report };
}
