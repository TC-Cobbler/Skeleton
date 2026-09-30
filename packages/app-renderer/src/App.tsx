import { useEffect, useState, type FormEvent } from "react";
import type { AppInfo, PageTree, ProjectInfo, UiNode } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { DevServerPanel } from "./DevServerPanel.js";
import { ProjectPicker } from "./ProjectPicker.js";

// Phase 1 shell: pick or create a project, then its dev server and page tree.
// The canvas (Phase 2) replaces the page tree probe.

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    call("app:info", null).then(setInfo, (err: unknown) =>
      setError(String(err)),
    );
  }, []);

  async function close() {
    if (!project) return;
    try {
      await call("devserver:stop", { projectRoot: project.projectRoot });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setProject(null);
  }

  return (
    <main>
      <header className="row">
        <h1>{project ? project.name : "Skeleton"}</h1>
        {project && (
          <>
            <code className="muted" data-testid="project-root">{project.projectRoot}</code>
            <button type="button" onClick={() => void close()}>
              Close project
            </button>
          </>
        )}
      </header>
      {info && (
        <p className="muted" data-testid="app-info">
          v{info.appVersion} · Electron {info.electron} · Node {info.node} ·{" "}
          {info.platform}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {project ? (
        <>
          <DevServerPanel projectRoot={project.projectRoot} autoStart />
          <PageTreeProbe projectRoot={project.projectRoot} />
        </>
      ) : (
        <ProjectPicker onOpen={setProject} />
      )}
    </main>
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
