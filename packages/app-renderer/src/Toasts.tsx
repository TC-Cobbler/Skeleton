import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "./copy.js";
import type { Message, MessageAction } from "./messages.js";

export interface Toast {
  id: number;
  kind: "error" | "warning";
  message: Message;
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
  /** Opening Details keeps a notice up until it's dismissed (spec §4). */
  const hold = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const push = useCallback(
    (kind: Toast["kind"], message: Message) => {
      const id = ++next.current;
      // The same notice twice in a row replaces the first.
      setToasts((all) => [...all.filter((t) => t.message.text !== message.text), { id, kind, message }].slice(-4));
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
  return { toasts, push, dismiss, hold };
}

export function Toasts({
  toasts,
  onDismiss,
  onHold,
  onAction,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onHold: (id: number) => void;
  onAction: (action: MessageAction) => void;
}) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"} data-testid={t.kind === "error" ? "edit-error" : "edit-warning"}>
          <div className="toast-body">
            <span className="toast-text">{t.message.text}</span>
            {t.message.actions.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  onDismiss(t.id);
                  onAction(a);
                }}
              >
                {copy.actions[a]}
              </button>
            ))}
            <button type="button" className="quiet" aria-label={copy.toasts.dismiss} onClick={() => onDismiss(t.id)}>
              ×
            </button>
          </div>
          <MessageDetails message={t.message} onOpen={() => onHold(t.id)} />
        </div>
      ))}
    </div>
  );
}

/** The technical text behind a message, and Copy details for the agent (spec §4). */
export function MessageDetails({ message, onOpen }: { message: Message; onOpen?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (message.details === null) return null;
  return (
    <details
      className="message-details"
      onToggle={(e) => {
        if (e.currentTarget.open) onOpen?.();
      }}
    >
      <summary>{copy.details.show}</summary>
      <pre data-testid="message-details">{message.details}</pre>
      {message.copy !== null && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(message.copy ?? "").then(
              () => setCopied(true),
              (err: unknown) => console.error("[details] couldn't copy", err),
            );
          }}
        >
          {copied ? copy.details.copied : copy.details.copy}
        </button>
      )}
    </details>
  );
}

/** A message shown in place (a panel's or the loop's), with its Details. */
export function MessageText({ message, className = "error" }: { message: Message; className?: string }) {
  return (
    <div className={className} role="alert">
      <p>{message.text}</p>
      <MessageDetails message={message} />
    </div>
  );
}
