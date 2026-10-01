import { useEffect, useState, type FormEvent } from "react";
import type { ProjectInfo, ProjectList } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { copy } from "./copy.js";

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
      const folder = await call("dialog:chooseFolder", { title: copy.picker.openTitle });
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
          <h2>{copy.picker.open}</h2>
          <button type="button" onClick={() => void openFolder()}>
            {copy.picker.openFolder}
          </button>
        </header>
        {error && <p className="error">{error}</p>}
        {list && list.recent.length === 0 && <p className="muted">{copy.picker.noRecent}</p>}
        <ul className="recent" aria-label={copy.picker.recent}>
          {list?.recent.map((r) => (
            <li key={r.projectRoot}>
              <button type="button" className="link" disabled={r.missing} onClick={() => void openRecent(r.projectRoot)}>
                <strong>{r.name}</strong> <span className="muted">{r.projectRoot}</span>
                {r.missing && <span className="error"> {copy.picker.missing}</span>}
              </button>
              <button type="button" className="quiet" aria-label={copy.picker.forgetLabel(r.name)} onClick={() => void forget(r.projectRoot)}>
                {copy.picker.forget}
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
      const folder = await call("dialog:chooseFolder", { title: copy.picker.parentTitle, defaultPath: parentDir });
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
      <h2>{copy.picker.newProject}</h2>
      <form onSubmit={create} className="stack">
        <input aria-label={copy.picker.projectName} placeholder={copy.picker.projectName} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <div className="row">
          <span className="muted" data-testid="parent-dir">
            {copy.picker.inFolder(parentDir)}
          </span>
          <button type="button" onClick={() => void chooseParent()} disabled={busy}>
            {copy.picker.change}
          </button>
        </div>
        <div className="row">
          <button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? copy.picker.creating : copy.picker.create}
          </button>
          {busy && <span className="muted">{copy.picker.createProgress}</span>}
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
