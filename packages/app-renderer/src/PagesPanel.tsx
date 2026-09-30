import { useEffect, useState } from "react";
import type { PageEntry, PageIntent, PageList } from "@skeleton/app-main/ipc";
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
  /** Add, rename or delete a page (T3.6); resolves when it's done. */
  onPageOp: (op: PageIntent) => Promise<void>;
}

/** "Order history" → "/order-history" (main has the final say). */
export function pathForName(name: string): string {
  return `/${name.trim().toLowerCase().split(/\s+/).filter(Boolean).join("-")}`;
}

/** "OrderHistoryPage" → "Order History". */
export function nameForComponent(component: string): string {
  return component.replace(/Page$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2") || component;
}

type Form = { kind: "add" | "rename"; name: string; path: string; pathEdited: boolean } | { kind: "delete" } | null;

/** Page list mirroring the router (T2.5). Selecting a page navigates the canvas. */
export function PagesPanel({ list, error, current, onOpen, onPageOp }: PagesPanelProps) {
  const [form, setForm] = useState<Form>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(null), [current?.path]);
  const run = (op: PageIntent) => {
    setBusy(true);
    onPageOp(op).then(
      () => {
        setBusy(false);
        setForm(null);
      },
      () => setBusy(false),
    );
  };
  const editable = current !== null && !current.dynamic && current.exists;
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
      {form === null && (
        <div className="row page-actions">
          <button type="button" onClick={() => setForm({ kind: "add", name: "", path: "", pathEdited: false })}>
            Add page
          </button>
          <button
            type="button"
            disabled={!editable}
            onClick={() => current?.component && setForm({ kind: "rename", name: nameForComponent(current.component), path: current.path, pathEdited: true })}
          >
            Rename
          </button>
          <button type="button" disabled={!editable || (list?.pages.filter((p) => p.exists).length ?? 0) < 2} onClick={() => setForm({ kind: "delete" })}>
            Delete
          </button>
        </div>
      )}
      {form && form.kind !== "delete" && (
        <form
          className="page-form"
          aria-label={form.kind === "add" ? "Add page" : "Rename page"}
          onSubmit={(e) => {
            e.preventDefault();
            if (form.kind === "add") run({ op: "addPage", name: form.name, path: form.path });
            else if (current) {
              const renamed = form.name !== nameForComponent(current.component ?? "");
              run({ op: "renamePage", path: current.path, name: renamed ? form.name : null, newPath: form.path !== current.path ? form.path : null });
            }
          }}
        >
          <label>
            Name
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, path: form.pathEdited ? form.path : pathForName(e.target.value) })}
            />
          </label>
          <label>
            Path
            <input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value, pathEdited: true })} />
          </label>
          <div className="row">
            <button type="submit" disabled={busy || form.name.trim() === "" || form.path === ""}>
              {form.kind === "add" ? "Add" : "Rename"}
            </button>
            <button type="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {form?.kind === "delete" && current && (
        <div className="confirm" role="alertdialog" aria-label="Confirm delete page">
          <p>
            Delete <code>{current.path}</code> and <code>{current.file}</code>?
          </p>
          <div className="row">
            <button type="button" className="danger" disabled={busy} onClick={() => run({ op: "deletePage", path: current.path })}>
              Delete page
            </button>
            <button type="button" onClick={() => setForm(null)} autoFocus>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
