import { useEffect, useState, type FormEvent } from "react";
import type { ProjectInfo, ProjectList } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** New project / open / recent (T1.4). */
export function ProjectPicker({ onOpen }: { onOpen: (project: ProjectInfo) => void }) {
  const [list, setList] = useState<ProjectList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call("project:list", null).then(setList, (err: unknown) => setError(message(err)));
  }, []);

  async function openFolder() {
    setError(null);
    try {
      const folder = await call("dialog:chooseFolder", { title: "Open a Skeleton project" });
      if (folder) onOpen(await call("project:open", { projectRoot: folder }));
    } catch (err) {
      setError(message(err));
    }
  }

  async function openRecent(projectRoot: string) {
    setError(null);
    try {
      onOpen(await call("project:open", { projectRoot }));
    } catch (err) {
      setError(message(err));
    }
  }

  async function forget(projectRoot: string) {
    try {
      const recent = await call("project:forget", { projectRoot });
      setList((prev) => (prev ? { ...prev, recent } : prev));
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <div className="picker">
      {list && <NewProjectForm defaultParentDir={list.defaultParentDir} onCreated={onOpen} />}
      <section>
        <header className="row">
          <h2>Open</h2>
          <button type="button" onClick={() => void openFolder()}>
            Open…
          </button>
        </header>
        {error && <p className="error">{error}</p>}
        {list && list.recent.length === 0 && <p className="muted">No recent projects.</p>}
        <ul className="recent" aria-label="Recent projects">
          {list?.recent.map((r) => (
            <li key={r.projectRoot}>
              <button type="button" className="link" disabled={r.missing} onClick={() => void openRecent(r.projectRoot)}>
                <strong>{r.name}</strong> <span className="muted">{r.projectRoot}</span>
                {r.missing && <span className="error"> (missing)</span>}
              </button>
              <button type="button" className="quiet" aria-label={`Forget ${r.name}`} onClick={() => void forget(r.projectRoot)}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NewProjectForm({ defaultParentDir, onCreated }: { defaultParentDir: string; onCreated: (p: ProjectInfo) => void }) {
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseParent() {
    try {
      const folder = await call("dialog:chooseFolder", { title: "Where should the project go?", defaultPath: parentDir });
      if (folder) setParentDir(folder);
    } catch (err) {
      setError(message(err));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await call("project:create", { parentDir, name: name.trim() });
      onCreated({ projectRoot: created.projectRoot, name: name.trim() });
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>New project</h2>
      <form onSubmit={create} className="stack">
        <input aria-label="Project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <div className="row">
          <span className="muted" data-testid="parent-dir">
            in {parentDir}
          </span>
          <button type="button" onClick={() => void chooseParent()} disabled={busy}>
            Change…
          </button>
        </div>
        <div className="row">
          <button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? "Creating…" : "Create project"}
          </button>
          {busy && <span className="muted">Writing files, installing dependencies, making the first commit…</span>}
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
