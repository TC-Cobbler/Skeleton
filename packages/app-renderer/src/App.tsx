import { useEffect, useState, type FormEvent } from "react";
import type { AppInfo, PageTree, UiNode } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { DevServerPanel } from "./DevServerPanel.js";

// Phase 1 shell. Proves the renderer → main → core path end to end; the project
// picker (T1.4) replaces the project root field, and the canvas (Phase 2) the rest.

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectRoot, setProjectRoot] = useState("");

  useEffect(() => {
    call("app:info", null).then(setInfo, (err: unknown) =>
      setError(String(err)),
    );
  }, []);

  return (
    <main>
      <h1>Skeleton</h1>
      {info && (
        <p className="muted" data-testid="app-info">
          v{info.appVersion} · Electron {info.electron} · Node {info.node} ·{" "}
          {info.platform}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <ProjectRootField value={projectRoot} onChange={setProjectRoot} />
      <DevServerPanel projectRoot={projectRoot} />
      <PageTreeProbe projectRoot={projectRoot} />
    </main>
  );
}

function ProjectRootField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft.trim());
      }}
    >
      <input
        aria-label="Project root"
        placeholder="/absolute/path/to/project"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit">Open</button>
    </form>
  );
}

function PageTreeProbe({ projectRoot }: { projectRoot: string }) {
  const [file, setFile] = useState("src/pages/HomePage.tsx");
  const [tree, setTree] = useState<PageTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTree(null);
    try {
      setTree(await call("page:tree", { projectRoot, file }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <h2>Page tree</h2>
      <form onSubmit={load}>
        <input
          aria-label="Page file"
          value={file}
          onChange={(e) => setFile(e.target.value)}
        />
        <button type="submit" disabled={!projectRoot}>
          Parse
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {tree?.rootError && <p className="error">{tree.rootError}</p>}
      {tree && (
        <ul className="tree">
          {tree.roots.map((node, i) => (
            <TreeNode key={i} node={node} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TreeNode({ node }: { node: UiNode }) {
  return (
    <li>
      <span className={`kind kind-${node.kind}`}>{node.kind}</span> {node.name}
      {node.id && <code> {node.id}</code>}
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, i) => (
            <TreeNode key={child.id ?? i} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
