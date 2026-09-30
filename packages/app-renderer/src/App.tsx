import { useEffect, useState, type FormEvent } from "react";
import type { AppInfo, PageTree, UiNode } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";

// Phase 1 shell. Proves the renderer → main → core path end to end; the project
// picker (T1.4) and canvas (Phase 2) replace the page form.

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <PageTreeProbe />
    </main>
  );
}

function PageTreeProbe() {
  const [projectRoot, setProjectRoot] = useState("");
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
          aria-label="Project root"
          placeholder="/absolute/path/to/project"
          value={projectRoot}
          onChange={(e) => setProjectRoot(e.target.value)}
        />
        <input
          aria-label="Page file"
          value={file}
          onChange={(e) => setFile(e.target.value)}
        />
        <button type="submit">Parse</button>
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
