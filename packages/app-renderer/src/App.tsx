import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, EditHistory, EditIntent, ProjectInfo, TokenWrite, UiNode, ViolationItem } from "@skeleton/app-main/ipc";
import type { DropTarget, GizmoCommit } from "@skeleton/overlay/protocol";
import { call } from "./bridge.js";
import type { KeyedNode } from "./canvas/nodes.js";
import { Canvas, type GizmoContext, type PreviewLayout } from "./Canvas.js";
import { COLOUR_GROUP } from "./colour.js";
import { ColourPanel, type ColourChip } from "./ColourPanel.js";
import { useCanvasDrag } from "./canvas/drag.js";
import { agentLogicIn, parentKeyOf, refFor, type NodeRef } from "./canvas/nodes.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { SelectionPanel } from "./SelectionPanel.js";
import { Toasts, useToasts } from "./Toasts.js";
import { DevServerPanel } from "./DevServerPanel.js";
import { matchPage } from "./canvas/routes.js";
import { LayersPanel } from "./LayersPanel.js";
import { PagesPanel, usePages } from "./PagesPanel.js";
import { PalettePanel, usePalette } from "./PalettePanel.js";
import { useDevServer } from "./useDevServer.js";
import { usePageTree } from "./usePageTree.js";
import { useProjectRevision } from "./useProjectRevision.js";
import { ProjectPicker } from "./ProjectPicker.js";
import { TokensPanel, useTokens } from "./TokensPanel.js";
import { useViolations, ViolationsPanel } from "./ViolationsPanel.js";

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

/** Why gizmos can't edit an element's classes (instance overrides, scale steps), or null when they can. */
function classEditsBlocked(node: UiNode): string | null {
  if (node.kind === "locked") return "it's a locked block: its classes are agent code";
  if (!node.id) return "it has no data-ui-id";
  if (node.protectedProps.includes("className")) return "its className is set by agent code";
  return null;
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
  const tokens = useTokens(project.projectRoot, revision);
  const violations = useViolations(project.projectRoot, revision);
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
  const [selected, setSelectedRaw, selectId] = useSelection(page.nodes);
  // Bumped by every selection the user makes. An edit's response (which waits for the
  // typecheck) only moves the selection if the user hasn't picked something since.
  const selectionEpoch = useRef(0);
  const setSelected = useCallback(
    (key: string | null) => {
      selectionEpoch.current++;
      setSelectedRaw(key);
    },
    [setSelectedRaw],
  );
  const toasts = useToasts();
  const pushToast = toasts.push;
  const setEditError = useCallback((message: string | null) => message !== null && pushToast("error", message), [pushToast]);
  // Say once per project when edits can't be typechecked (T3.7).
  const warnedUnchecked = useRef(false);
  const noteUnchecked = useCallback(
    (reason: string | null) => {
      if (reason === null || warnedUnchecked.current) return;
      warnedUnchecked.current = true;
      pushToast("warning", `Edits aren't being typechecked: ${reason}`);
    },
    [pushToast],
  );
  const edit = useCallback(
    (intent: EditIntent, after?: () => void, settled?: (ok: boolean) => void) => {
      if (!file) {
        settled?.(false);
        return;
      }
      const epoch = selectionEpoch.current;
      call("page:edit", { projectRoot: project.projectRoot, file, edit: intent }).then(
        (result) => {
          page.reload();
          setRevision((r) => r + 1);
          noteUnchecked(result.unchecked);
          settled?.(true);
          if (selectionEpoch.current !== epoch) return;
          if (result.select) selectId(result.select);
          after?.();
        },
        (err: unknown) => {
          // A rolled-back edit did touch the file: re-read it either way.
          page.reload();
          settled?.(false);
          setEditError(err instanceof Error ? err.message.replace(/^page:edit: /, "") : String(err));
        },
      );
    },
    [file, project.projectRoot, page.reload, selectId, setEditError, noteUnchecked],
  );
  // Token writes (T4.1): through the token writer in main, undoable like edits.
  const setTokenSheet = tokens.set;
  const writeTokens = useCallback(
    (writes: TokenWrite[], settled?: (ok: boolean) => void) => {
      call("tokens:write", { projectRoot: project.projectRoot, writes }).then(
        (result) => {
          setTokenSheet(result.sheet);
          setRevision((r) => r + 1);
          settled?.(true);
        },
        (err: unknown) => {
          setRevision((r) => r + 1);
          settled?.(false);
          setEditError(err instanceof Error ? err.message.replace(/^tokens:write: /, "") : String(err));
        },
      );
    },
    [project.projectRoot, setTokenSheet, setEditError],
  );
  const [inspectorTab, setInspectorTab] = useState<"element" | "tokens" | "violations">("element");
  // Token counts and highlighting on the canvas (T4.2), while the token panel is open.
  const [tokenCounts, setTokenCounts] = useState<Record<string, number> | null>(null);
  const [tokenHover, setTokenHover] = useState<string | null>(null);
  // Always counted: gizmo drags show how many elements they affect (T4.2, T4.4).
  const tokenUsage = tokens.sheet?.usage ?? null;
  useEffect(() => {
    if (inspectorTab !== "tokens") setTokenHover(null);
  }, [inspectorTab]);
  const [dark, setDark] = useState(false);
  // Gizmos (T4.3–T4.5): what the selected element's handles can do, and their writes.
  const [gizmoDone, setGizmoDone] = useState<{ ok: boolean } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [colourChip, setColourChip] = useState<ColourChip | null>(null);
  const selectedForGizmos = page.nodes.find((n) => n.key === selected) ?? null;
  const spacingSteps = useMemo(
    () =>
      (palette.palette?.layout.stack.find((g) => g.id === "gap")?.options ?? [])
        .map((o) => (o.class ? Number(o.class.slice("gap-".length)) : NaN))
        .filter((n) => Number.isFinite(n)),
    [palette.palette],
  );
  const gizmos = useMemo((): GizmoContext | null => {
    if (!selectedForGizmos || !tokens.sheet) return null;
    return {
      key: selectedForGizmos.key,
      tokens: tokens.sheet.tokens.map((t) => ({ name: t.name, value: dark && t.dark !== null ? t.dark : t.value, resolved: t.resolved, colour: t.group === "colour" })),
      spacingSteps,
      classEdits: classEditsBlocked(selectedForGizmos.node),
    };
  }, [selectedForGizmos, tokens.sheet, dark, spacingSteps]);
  useEffect(() => setColourChip(null), [selected]);
  const done = useCallback((ok: boolean) => setGizmoDone({ ok }), []);
  /** Replace the element's classes matching `remove` (a regex source) with `add`. */
  const setClassFor = (key: string, remove: string, add: string) => {
    const node = page.nodes.find((n) => n.key === key)?.node;
    const blocked = node ? classEditsBlocked(node) : "it isn't on the page any more";
    if (!node?.id || blocked) {
      setEditError(`Can't change this element: ${blocked ?? "it has no data-ui-id"}`);
      done(false);
      return;
    }
    const re = new RegExp(remove);
    const classes = typeof node.props["className"] === "string" ? node.props["className"].split(/\s+/).filter(Boolean) : [];
    edit({ op: "setClass", id: node.id, add: [add], remove: classes.filter((c) => re.test(c)) }, undefined, done);
  };
  const onGizmoCommit = (key: string, commit: GizmoCommit) => {
    if (commit.kind === "token") writeTokens([{ name: commit.name, value: commit.value, mode: null }], done);
    else setClassFor(key, commit.remove, commit.add);
  };
  // Violations (T4.6): snap is a setClass in the violation's file; promote and keep go to main.
  const fixViolation = (task: Promise<unknown>, channel: string) => {
    task.then(
      () => {
        page.reload();
        setRevision((r) => r + 1);
      },
      (err: unknown) => {
        page.reload();
        setRevision((r) => r + 1);
        setEditError(err instanceof Error ? err.message.replace(new RegExp(`^${channel}: `), "") : String(err));
      },
    );
  };
  const ref = (v: ViolationItem) => ({ file: v.file, offset: v.offset, value: v.value });
  const violationActions = {
    onSelect: (v: ViolationItem) => {
      const id = v.element?.id;
      if (v.file !== file) {
        const target = pages.list?.pages.find((p) => p.file === v.file && !p.dynamic);
        if (target) {
          setPathname(target.path);
          setNavigate({ path: target.path });
        }
      }
      if (id) selectId(id);
    },
    onSnap: (v: ViolationItem) => {
      if (!v.element?.id || !v.nearest) return;
      const intent: EditIntent = { op: "setClass", id: v.element.id, add: [v.nearest.utility], remove: [v.value] };
      fixViolation(call("page:edit", { projectRoot: project.projectRoot, file: v.file, edit: intent }), "page:edit");
    },
    onPromote: (v: ViolationItem, name: string) =>
      fixViolation(call("violations:promote", { projectRoot: project.projectRoot, violation: ref(v), name }), "violations:promote"),
    onKeep: (v: ViolationItem) => fixViolation(call("violations:keep", { projectRoot: project.projectRoot, violation: ref(v) }), "violations:keep"),
  };
  const activeViolations = violations.report?.items.filter((v) => !v.kept).length ?? 0;
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
    edit({ op: "remove", ref, allowLocked }, () => (parent?.id ? selectId(parent.id) : setSelectedRaw(null)));
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
  // Undo and redo (T3.8): the session's edit stack in main.
  const [history, setHistory] = useState<EditHistory>({ undo: null, redo: null });
  useEffect(() => {
    let cancelled = false;
    call("edit:history", { projectRoot: project.projectRoot }).then(
      (h) => !cancelled && setHistory(h),
      (err: unknown) => !cancelled && setEditError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [project.projectRoot, revision, setEditError]);
  // After undoing a page op, the page on screen may be gone: show one that exists.
  const [checkPage, setCheckPage] = useState(false);
  const historyStep = (direction: "undo" | "redo") => {
    call(direction === "undo" ? "edit:undo" : "edit:redo", { projectRoot: project.projectRoot }).then(
      (result) => {
        setHistory(result.history);
        page.reload();
        setRevision((r) => r + 1);
        noteUnchecked(result.unchecked);
        if (result.files.includes("src/router.tsx")) setCheckPage(true);
      },
      (err: unknown) => {
        page.reload();
        setRevision((r) => r + 1);
        setEditError(err instanceof Error ? err.message.replace(/^edit:(undo|redo): /, "") : String(err));
      },
    );
  };
  useEffect(() => {
    if (!checkPage || !pages.list) return;
    setCheckPage(false);
    if (current?.exists) return;
    const fallback = pages.list.pages.find((p) => p.exists && !p.dynamic && p.path === "/") ?? pages.list.pages.find((p) => p.exists && !p.dynamic);
    if (fallback) {
      setPathname(fallback.path);
      setNavigate({ path: fallback.path });
    }
  }, [checkPage, pages.list, current]);

  const onShortcut = (key: string, mod: boolean, shift: boolean) => {
    if ((key === "Delete" || key === "Backspace") && !mod && selected) requestDelete(selected);
    else if (mod && (key === "z" || key === "Z")) historyStep(shift ? "redo" : "undo");
    else if (mod && (key === "y" || key === "Y")) historyStep("redo");
  };
  const latestShortcut = useRef(onShortcut);
  latestShortcut.current = onShortcut;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Text fields keep their own keys, undo included.
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Delete" || e.key === "Backspace" || (mod && ["z", "Z", "y", "Y"].includes(e.key))) {
        e.preventDefault();
        latestShortcut.current(e.key, mod, e.shiftKey);
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
        <div className="row history" role="group" aria-label="History">
          <button type="button" disabled={!history.undo} title={history.undo ? `Undo ${history.undo} (Ctrl+Z)` : "Nothing to undo"} onClick={() => historyStep("undo")}>
            Undo
          </button>
          <button type="button" disabled={!history.redo} title={history.redo ? `Redo ${history.redo} (Ctrl+Shift+Z)` : "Nothing to redo"} onClick={() => historyStep("redo")}>
            Redo
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
        <PagesPanel
          list={pages.list}
          error={pages.error}
          current={current}
          onOpen={(p) => {
            setPathname(p.path);
            setNavigate({ path: p.path });
          }}
          onPageOp={async (op) => {
            try {
              const result = await call("project:page", { projectRoot: project.projectRoot, page: op });
              setRevision((r) => r + 1);
              if (result.path) {
                setPathname(result.path);
                setNavigate({ path: result.path });
              }
            } catch (err) {
              setRevision((r) => r + 1);
              setEditError(err instanceof Error ? err.message.replace(/^project:page: /, "") : String(err));
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
        <div className="segmented tabs" role="tablist" aria-label="Inspector">
          {(["element", "tokens", "violations"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} aria-pressed={inspectorTab === tab} onClick={() => setInspectorTab(tab)}>
              {tab === "element" ? "Element" : tab === "tokens" ? "Tokens" : `Violations${activeViolations > 0 ? ` (${activeViolations})` : ""}`}
            </button>
          ))}
        </div>
        {inspectorTab === "violations" && <ViolationsPanel report={violations.report} error={violations.error} {...violationActions} />}
        {inspectorTab === "tokens" && (
          <TokensPanel sheet={tokens.sheet} error={tokens.error} dark={dark} counts={tokenCounts} onWrite={writeTokens} onHover={setTokenHover} />
        )}
        {inspectorTab === "element" && (
          <>
            {colourChip && colourChip.key === selected && (
              <ColourPanel
                chip={colourChip}
                token={tokens.sheet?.tokens.find((t) => t.name === colourChip.token) ?? null}
                dark={dark}
                classEdits={gizmos ? gizmos.classEdits : "nothing selected"}
                onPreview={setPreview}
                onToken={(value) => {
                  const token = tokens.sheet?.tokens.find((t) => t.name === colourChip.token);
                  writeTokens([{ name: colourChip.token, value, mode: token?.dark != null && dark ? "dark" : token?.dark != null ? "light" : null }], (ok) => {
                    done(ok);
                    setPreview(null);
                  });
                }}
                onInstance={(utility, cls) => {
                  setClassFor(colourChip.key, COLOUR_GROUP[utility] ?? "^$", cls);
                  setPreview(null);
                }}
                onClose={() => {
                  setPreview(null);
                  setColourChip(null);
                }}
              />
            )}
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
          </>
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
        drag={canvasDrag.drag ? { clientX: canvasDrag.drag.clientX, clientY: canvasDrag.drag.clientY, seq: canvasDrag.drag.seq, moving: null } : null}
        onDropTarget={canvasDrag.report}
        onMove={moveNode}
        onKey={onShortcut}
        tokenUsage={tokenUsage}
        tokenHighlight={tokenHover}
        onTokenCounts={setTokenCounts}
        gizmos={gizmos}
        gizmoDone={gizmoDone}
        preview={preview}
        onGizmoCommit={onGizmoCommit}
        onColourChip={(chip) => {
          setInspectorTab("element");
          setColourChip(chip);
        }}
      />
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
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
