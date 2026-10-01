import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "./copy.js";

export interface Toast {
  id: number;
  kind: "error" | "warning";
  text: string;
}

const LIFETIME: Record<Toast["kind"], number> = { error: 12_000, warning: 8_000 };

/** Short-lived notices: failed or undone edits (T3.7), and why edits aren't being checked. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = ++next.current;
      // The same notice twice in a row replaces the first.
      setToasts((all) => [...all.filter((t) => t.text !== text), { id, kind, text }].slice(-4));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME[kind]),
      );
    },
    [dismiss],
  );
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"} data-testid={t.kind === "error" ? "edit-error" : "edit-warning"}>
          <span className="toast-text">{t.text}</span>
          <button type="button" className="quiet" aria-label={copy.toasts.dismiss} onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
