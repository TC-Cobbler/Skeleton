import { useEffect, useState } from "react";
import type { PageEntry, PageList } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

/** The project's pages, read from its router; refreshed when the app updates. */
export function usePages(projectRoot: string, revision: number): { list: PageList | null; error: string | null } {
  const [list, setList] = useState<PageList | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("project:pages", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setList(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { list, error };
}

export interface PagesPanelProps {
  list: PageList | null;
  error: string | null;
  current: PageEntry | null;
  onOpen: (page: PageEntry) => void;
}

/** Page list mirroring the router (T2.5). Selecting a page navigates the canvas. */
export function PagesPanel({ list, error, current, onOpen }: PagesPanelProps) {
  const unavailable = (p: PageEntry) =>
    p.dynamic ? "Needs route parameters; open it by navigating in the app" : !p.file ? "Not a page file Skeleton can read" : !p.exists ? `${p.file} is missing` : null;
  return (
    <section aria-label="Pages" className="pages">
      <h2>Pages</h2>
      {error && <p className="error">{error}</p>}
      {list?.error && <p className="error">{list.error}</p>}
      <ul role="listbox" aria-label="Pages list">
        {list?.pages.map((p, i) => {
          const why = unavailable(p);
          const isCurrent = current !== null && p.path === current.path && p.file === current.file;
          return (
            <li
              key={`${p.path}#${i}`}
              role="option"
              aria-selected={isCurrent}
              aria-disabled={why !== null}
              title={why ?? p.file ?? undefined}
              className={`page${isCurrent ? " is-selected" : ""}${why ? " is-disabled" : ""}`}
              onClick={() => why === null && onOpen(p)}
            >
              <code>{p.path}</code> <span className="muted">{p.component ?? "?"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
