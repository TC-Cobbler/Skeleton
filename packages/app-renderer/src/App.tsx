import { useEffect, useState } from "react";
import type { AppInfo, ProjectInfo } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { Canvas } from "./Canvas.js";
import { DevServerPanel } from "./DevServerPanel.js";
import { useDevServer } from "./useDevServer.js";
import { usePageTree } from "./usePageTree.js";
import { ProjectPicker } from "./ProjectPicker.js";

// Pick or create a project; then the canvas (the running app with Skeleton's
// overlay), the selection, and the dev server log.

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
        <ProjectView project={project} />
      ) : (
        <ProjectPicker onOpen={setProject} />
      )}
    </main>
  );
}

const DEFAULT_PAGE = "src/pages/HomePage.tsx";

function ProjectView({ project }: { project: ProjectInfo }) {
  const server = useDevServer(project.projectRoot, true);
  const page = usePageTree(project.projectRoot, DEFAULT_PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "interact">("select");
  const selectedNode = page.nodes.find((n) => n.key === selected) ?? null;

  return (
    <div className="project">
      <aside className="sidebar">
        <div className="row">
          <strong>Canvas</strong>
          <button
            type="button"
            aria-pressed={mode === "interact"}
            onClick={() => setMode((m) => (m === "select" ? "interact" : "select"))}
          >
            {mode === "select" ? "Select mode" : "Interact mode"}
          </button>
        </div>
        {page.error && <p className="error">{page.error}</p>}
        {page.tree?.rootError && <p className="error">{page.tree.rootError}</p>}
        <section aria-label="Selection" data-testid="selection">
          <h2>Selection</h2>
          {selectedNode ? (
            <dl className="inspector">
              <dt>Element</dt>
              <dd data-testid="selection-name">{selectedNode.node.name}</dd>
              <dt>Kind</dt>
              <dd data-testid="selection-kind">{selectedNode.node.kind}</dd>
              <dt>ID</dt>
              <dd data-testid="selection-id">{selectedNode.node.id ?? "none"}</dd>
              {selectedNode.node.lockReason && (
                <>
                  <dt>Locked</dt>
                  <dd>{selectedNode.node.lockReason}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted">{hovered ? "Click to select." : "Nothing selected."}</p>
          )}
        </section>
      </aside>
      <Canvas
        status={server.status}
        file={page.tree ? DEFAULT_PAGE : null}
        nodes={page.overlayNodes}
        selected={selected}
        highlighted={null}
        mode={mode}
        onSelect={setSelected}
        onHover={setHovered}
        onUpdated={page.reload}
      />
      <footer className="bottom">
        <DevServerPanel server={server} />
      </footer>
    </div>
  );
}
