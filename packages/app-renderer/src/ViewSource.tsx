import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UiNode } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { copy } from "./copy.js";

/** Read-only source of a locked block (T2.4): what the agent wrote, exactly. */
export function ViewSource({ projectRoot, file, node }: { projectRoot: string; file: string; node: UiNode }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Shown in the top layer (Popover API) so the scrolling sidebar can't clip it,
  // placed just below the button.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el || !button.current) return;
    const r = button.current.getBoundingClientRect();
    el.style.left = `${r.left}px`;
    el.style.top = `${r.bottom + 8}px`;
    el.showPopover();
    return () => {
      if (el.matches(":popover-open")) el.hidePopover();
    };
  }, [open]);

  // Re-read on every open: the file may have changed since the tree was parsed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSource(null);
    call("page:source", { projectRoot, file }).then(
      (text) => !cancelled && setSource(text),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot, file, node.range.start, node.range.end]);

  const snippet = source?.slice(node.range.start, node.range.end) ?? "";
  // The first line starts mid-line; indent it like the rest so the block reads naturally.
  const firstLineIndent = source ? source.slice(source.lastIndexOf("\n", node.range.start - 1) + 1, node.range.start) : "";
  const lines = (firstLineIndent.trim() === "" ? firstLineIndent + snippet : snippet).split("\n");
  const common = Math.min(...lines.filter((l) => l.trim() !== "").map((l) => /^\s*/.exec(l)?.[0].length ?? 0));

  return (
    <div className="view-source">
      <button ref={button} type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? copy.viewSource.hide : copy.viewSource.show}
      </button>
      {open && (
        <div ref={panel} popover="manual" role="dialog" aria-label={copy.viewSource.title} className="popover">
          <header className="row">
            <span className="muted">
              {copy.viewSource.where(file, node.range.startLine, node.range.endLine)}
            </span>
          </header>
          {error && <p className="error">{error}</p>}
          {source !== null && (
            <pre data-testid="view-source-code">
              {lines.map((line, i) => (
                <div key={i}>
                  <span className="ln">{node.range.startLine + i}</span>
                  {line.slice(Number.isFinite(common) ? common : 0)}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
