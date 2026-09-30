import type { DevServerStatus } from "@skeleton/app-main/ipc";

/**
 * The user's running app, embedded from its dev server (T2.1). A sandboxed iframe:
 * it can't navigate Skeleton's window, and the preload bridge only exists in the
 * top frame, so the app has no way into main (ADR 006).
 */
export function Canvas({ status }: { status: DevServerStatus | null }) {
  if (status?.state === "running" && status.url) {
    return (
      <div className="canvas">
        <iframe
          title="Preview"
          data-testid="canvas-frame"
          src={status.url}
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
