import { useCallback, useEffect, useState } from "react";
import type { AppInfo, ProjectInfo } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import type { KeyedNode } from "./canvas/nodes.js";
import { Canvas, type PreviewLayout } from "./Canvas.js";
import { DevServerPanel } from "./DevServerPanel.js";
import { matchPage } from "./canvas/routes.js";
import { LayersPanel } from "./LayersPanel.js";
import { PagesPanel, usePages } from "./PagesPanel.js";
import { PalettePanel, usePalette } from "./PalettePanel.js";
import { useDevServer } from "./useDevServer.js";
import { ViewSource } from "./ViewSource.js";
import { usePageTree } from "./usePageTree.js";
import { useProjectRevision } from "./useProjectRevision.js";
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

/** Shown until the router has been read. */
const DEFAULT_PAGE = "src/pages/HomePage.tsx";

/**
 * Selection by tree key, re-pointed after every re-parse: keys are child-index paths
 * and shift when elements are added, so the selection follows the element's
 * data-ui-id (or clears if it's gone), never the old position.
 */
function useSelection(nodes: KeyedNode[]): [string | null, (key: string | null) => void] {
  const [selection, setSelection] = useState<{ key: string; id: string | null; name: string } | null>(null);
  const select = useCallback(
    (key: string | null) => {
      const node = key === null ? null : nodes.find((n) => n.key === key);
      setSelection(node ? { key: node.key, id: node.node.id, name: node.node.name } : null);
    },
    [nodes],
  );
  useEffect(() => {
    setSelection((sel) => {
      if (!sel) return sel;
      const match = sel.id
        ? nodes.find((n) => n.node.id === sel.id)
        : nodes.find((n) => n.key === sel.key && n.node.name === sel.name);
      if (!match) return null;
      return match.key === sel.key ? sel : { ...sel, key: match.key };
    });
  }, [nodes]);
  return [selection?.key ?? null, select];
}

function ProjectView({ project }: { project: ProjectInfo }) {
  const server = useDevServer(project.projectRoot, true);
  const [revision, setRevision] = useState(0);
  const pages = usePages(project.projectRoot, revision);
  const palette = usePalette(project.projectRoot, revision);
  const [pathname, setPathname] = useState("/");
  const [navigate, setNavigate] = useState<{ path: string } | null>(null);
  const current = pages.list ? matchPage(pages.list.pages, pathname) : null;
  const file = current?.exists ? current.file : pages.list ? null : DEFAULT_PAGE;
  const page = usePageTree(project.projectRoot, file);
  // External changes (the agent, an editor): re-parse even if Vite's HMR didn't fire.
  const fsRevision = useProjectRevision(project.projectRoot);
  const reloadPage = page.reload;
  useEffect(() => {
    if (fsRevision.revision === 0) return;
    reloadPage();
    setRevision((r) => r + 1);
  }, [fsRevision.revision, reloadPage]);
  const [selected, setSelected] = useSelection(page.nodes);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "interact">("select");
  const [layout, setLayout] = useState<PreviewLayout>("desktop");
  const [dark, setDark] = useState(false);
  const [treeHover, setTreeHover] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState<Set<string> | null>(null);
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
        <div className="segmented" role="group" aria-label="Preview width">
          {(["desktop", "tablet", "mobile", "side-by-side"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={layout === l} onClick={() => setLayout(l)}>
              {l === "side-by-side" ? "Side by side" : l[0]?.toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Colour mode">
          <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>
            Light
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>
            Dark
          </button>
        </div>
        {page.error && <p className="error">{page.error}</p>}
        {fsRevision.error && <p className="error">{fsRevision.error}</p>}
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
                  <dd data-testid="selection-lock">{selectedNode.node.lockReason}</dd>
                </>
              )}
              {selectedNode.node.protectedProps.length > 0 && (
                <>
                  <dt>Agent logic</dt>
                  <dd>{selectedNode.node.protectedProps.join(", ")}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted">{hovered ? "Click to select." : "Nothing selected."}</p>
          )}
          {selectedNode?.node.kind === "locked" && (
            file && <ViewSource projectRoot={project.projectRoot} file={file} node={selectedNode.node} />
          )}
        </section>
        <PagesPanel
          list={pages.list}
          error={pages.error}
          current={current}
          onOpen={(p) => {
            setPathname(p.path);
            setNavigate({ path: p.path });
          }}
        />
        {!file && pages.list && <p className="muted">No page file for {pathname}.</p>}
        <PalettePanel palette={palette.palette} error={palette.error} />
        <LayersPanel
          nodes={page.nodes}
          selected={selected}
          hovered={treeHover ?? hovered}
          onScreen={onScreen}
          onSelect={setSelected}
          onHover={setTreeHover}
        />
      </aside>
      <Canvas
        status={server.status}
        file={page.tree ? file : null}
        nodes={page.overlayNodes}
        selected={selected}
        highlighted={treeHover}
        mode={mode}
        onSelect={setSelected}
        onHover={setHovered}
        onUpdated={() => {
          page.reload();
          setRevision((r) => r + 1);
        }}
        onLocation={setPathname}
        navigate={navigate}
        layout={layout}
        dark={dark}
        onMapped={(boxes) => setOnScreen(new Set(boxes.map((b) => b.key)))}
      />
      <footer className="bottom">
        <DevServerPanel server={server} />
      </footer>
    </div>
  );
}
