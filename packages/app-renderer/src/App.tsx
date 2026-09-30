import { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo, EditIntent, ProjectInfo } from "@skeleton/app-main/ipc";
import type { DropTarget } from "@skeleton/overlay/protocol";
import { call } from "./bridge.js";
import type { KeyedNode } from "./canvas/nodes.js";
import { Canvas, type PreviewLayout } from "./Canvas.js";
import { useCanvasDrag } from "./canvas/drag.js";
import { agentLogicIn, parentKeyOf, refFor, type NodeRef } from "./canvas/nodes.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { SelectionPanel } from "./SelectionPanel.js";
import { DevServerPanel } from "./DevServerPanel.js";
import { matchPage } from "./canvas/routes.js";
import { LayersPanel } from "./LayersPanel.js";
import { PagesPanel, usePages } from "./PagesPanel.js";
import { PalettePanel, usePalette } from "./PalettePanel.js";
import { useDevServer } from "./useDevServer.js";
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
 * data-ui-id (or clears if it's gone), never the old position. `selectId` selects an
 * element that may not be parsed yet (one just placed): it's picked up when it appears.
 */
function useSelection(nodes: KeyedNode[]): [string | null, (key: string | null) => void, (id: string) => void] {
  const [selection, setSelection] = useState<{ key: string | null; id: string | null; name: string } | null>(null);
  const select = useCallback(
    (key: string | null) => {
      const node = key === null ? null : nodes.find((n) => n.key === key);
      setSelection(node ? { key: node.key, id: node.node.id, name: node.node.name } : null);
    },
    [nodes],
  );
  const selectId = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.node.id === id);
      setSelection({ key: node?.key ?? null, id, name: node?.node.name ?? "" });
    },
    [nodes],
  );
  useEffect(() => {
    setSelection((sel) => {
      if (!sel) return sel;
      const match = sel.id
        ? nodes.find((n) => n.node.id === sel.id)
        : nodes.find((n) => n.key === sel.key && n.node.name === sel.name);
      // Still waiting for a placed element to be parsed.
      if (!match) return sel.key === null ? sel : null;
      return match.key === sel.key ? sel : { ...sel, key: match.key, name: match.node.name };
    });
  }, [nodes]);
  return [selection?.key ?? null, select, selectId];
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
  const page = usePageTree(project.projectRoot, file, palette.palette?.elements);
  // External changes (the agent, an editor): re-parse even if Vite's HMR didn't fire.
  const fsRevision = useProjectRevision(project.projectRoot);
  const reloadPage = page.reload;
  useEffect(() => {
    if (fsRevision.revision === 0) return;
    reloadPage();
    setRevision((r) => r + 1);
  }, [fsRevision.revision, reloadPage]);
  const [selected, setSelected, selectId] = useSelection(page.nodes);
  const [editError, setEditError] = useState<string | null>(null);
  const edit = useCallback(
    (intent: EditIntent, after?: () => void) => {
      if (!file) return;
      setEditError(null);
      call("page:edit", { projectRoot: project.projectRoot, file, edit: intent }).then(
        (result) => {
          page.reload();
          setRevision((r) => r + 1);
          if (result.select) selectId(result.select);
          after?.();
        },
        (err: unknown) => setEditError(err instanceof Error ? err.message : String(err)),
      );
    },
    [file, project.projectRoot, page.reload, selectId],
  );
  const moveNode = (key: string, target: DropTarget) => {
    const moved = page.nodes.find((n) => n.key === key)?.node;
    const parentKey = parentKeyOf(key);
    const parent = page.nodes.find((n) => n.key === parentKey)?.node;
    const dest = page.nodes.find((n) => n.key === target.parentKey)?.node;
    const from = Number(key.slice(key.lastIndexOf(".") + 1));
    if (!moved || !parent || !dest?.id) {
      setEditError(`Can't move there: ${dest?.name ?? "that element"} has no data-ui-id.`);
      return;
    }
    if (parentKey === target.parentKey && from === target.index) return; // dropped where it was
    const r = refFor(page.nodes, key);
    if ("reason" in r) {
      setEditError(`Can't move ${moved.name}: ${r.reason}`);
      return;
    }
    edit({ op: "move", ref: r.ref, newParentId: dest.id, index: target.index });
  };
  // Deleting (T3.4): straight away for layout Skeleton placed; agent code needs a confirm.
  const [confirmDelete, setConfirmDelete] = useState<{ key: string; logic: string[] } | null>(null);
  useEffect(() => setConfirmDelete(null), [selected]);
  const deletion = (key: string): { ref: NodeRef | null; reason: string | null } => {
    const r = refFor(page.nodes, key);
    return "ref" in r ? { ref: r.ref, reason: null } : { ref: null, reason: r.reason };
  };
  const removeNode = (key: string, allowLocked: boolean) => {
    const { ref, reason } = deletion(key);
    setConfirmDelete(null);
    if (!ref) {
      setEditError(`Can't delete: ${reason}`);
      return;
    }
    const parent = page.nodes.find((n) => n.key === parentKeyOf(key))?.node;
    edit({ op: "remove", ref, allowLocked }, () => (parent?.id ? selectId(parent.id) : setSelected(null)));
  };
  const requestDelete = (key: string) => {
    const node = page.nodes.find((n) => n.key === key)?.node;
    const { reason } = deletion(key);
    if (!node || reason) {
      setEditError(`Can't delete: ${reason ?? "nothing selected"}`);
      return;
    }
    const logic = agentLogicIn(node);
    if (logic.length > 0) setConfirmDelete({ key, logic });
    else removeNode(key, false);
  };
  const onShortcut = (key: string) => {
    if ((key === "Delete" || key === "Backspace") && selected) requestDelete(selected);
  };
  const latestShortcut = useRef(onShortcut);
  latestShortcut.current = onShortcut;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        latestShortcut.current(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const canvasDrag = useCanvasDrag((source, target) => {
    const parent = page.nodes.find((n) => n.key === target.parentKey)?.node;
    if (!parent?.id) {
      setEditError(`Can't drop there: ${parent?.name ?? "that element"} has no data-ui-id.`);
      return;
    }
    if (source.kind === "palette") edit({ op: "insert", parentId: parent.id, index: target.index, paletteId: source.paletteId });
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "interact">("select");
  const [layout, setLayout] = useState<PreviewLayout>("desktop");
  const [dark, setDark] = useState(false);
  const [treeHover, setTreeHover] = useState<string | null>(null);
  // What the overlay last mapped, and for which version of the page file.
  const [mapped, setMapped] = useState<{ version: string; keys: Set<string> } | null>(null);
  const synced = mapped !== null && mapped.version === page.tree?.version && mapped.keys.size > 0;
  const onScreen = mapped !== null && mapped.version === page.tree?.version ? mapped.keys : null;
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
        {editError && (
          <p className="error" role="alert" data-testid="edit-error">
            {editError}
          </p>
        )}
        {fsRevision.error && <p className="error">{fsRevision.error}</p>}
        {page.tree?.rootError && <p className="error">{page.tree.rootError}</p>}
        <PagesPanel
          list={pages.list}
          error={pages.error}
          current={current}
          onOpen={(p) => {
            setPathname(p.path);
            setNavigate({ path: p.path });
          }}
          onPageOp={async (op) => {
            setEditError(null);
            try {
              const result = await call("project:page", { projectRoot: project.projectRoot, page: op });
              setRevision((r) => r + 1);
              if (result.path) {
                setPathname(result.path);
                setNavigate({ path: result.path });
              }
            } catch (err) {
              setEditError(err instanceof Error ? err.message : String(err));
              throw err;
            }
          }}
        />
        {!file && pages.list && <p className="muted">No page file for {pathname}.</p>}
        <PalettePanel
          palette={palette.palette}
          error={palette.error}
          onStartDrag={(item, event) => canvasDrag.start({ kind: "palette", paletteId: item.id, label: item.label }, event)}
        />
        <LayersPanel
          nodes={page.nodes}
          selected={selected}
          hovered={treeHover ?? hovered}
          onScreen={onScreen}
          onSelect={setSelected}
          onHover={setTreeHover}
        />
      </aside>
      <aside className="inspector-panel" aria-label="Inspector">
        <SelectionPanel
          projectRoot={project.projectRoot}
          file={file}
          node={selectedNode?.node ?? null}
          hovered={hovered !== null}
          cannotDelete={selected ? deletion(selected).reason : null}
          confirming={confirmDelete !== null && confirmDelete.key === selected ? confirmDelete.logic : null}
          onDelete={() => selected && requestDelete(selected)}
          onConfirm={() => confirmDelete && removeNode(confirmDelete.key, true)}
          onCancel={() => setConfirmDelete(null)}
        />
        {selectedNode && (
          <PropertiesPanel
            node={selectedNode.node}
            schema={palette.palette?.elements[selectedNode.node.name] ?? null}
            layout={palette.palette?.layout ?? null}
            onEdit={(intent) => edit(intent)}
          />
        )}
      </aside>
      <Canvas
        status={server.status}
        file={page.tree ? file : null}
        version={page.tree?.version ?? null}
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
        onMapped={(boxes, version) => setMapped({ version, keys: new Set(boxes.map((b) => b.key)) })}
        synced={synced}
        drag={canvasDrag.drag ? { clientX: canvasDrag.drag.clientX, clientY: canvasDrag.drag.clientY, moving: null } : null}
        onDropTarget={canvasDrag.report}
        onMove={moveNode}
        onKey={(key) => onShortcut(key)}
      />
      {canvasDrag.drag && (
        <div className="drag-ghost" style={{ left: canvasDrag.drag.clientX + 12, top: canvasDrag.drag.clientY + 12 }}>
          {canvasDrag.drag.source.label}
        </div>
      )}
      <footer className="bottom">
        <DevServerPanel server={server} />
      </footer>
    </div>
  );
}
