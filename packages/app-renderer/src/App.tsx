import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo, EditHistory, EditIntent, NoteOp, NoteView, ProjectInfo, TokenWrite, UiNode, ViolationItem } from "@skeleton/app-main/ipc";
import { isShortcut, type DropTarget, type GizmoCommit } from "@skeleton/overlay/protocol";
import { call } from "./bridge.js";
import type { KeyedNode } from "./canvas/nodes.js";
import { Canvas, type GizmoContext, type PreviewLayout } from "./Canvas.js";
import { COLOUR_GROUP } from "./colour.js";
import { ColourPanel, type ColourChip } from "./ColourPanel.js";
import { useCanvasDrag } from "./canvas/drag.js";
import { agentLogicIn, openableFor, parentKeyOf, refFor, reorderTarget, textEditable, type NodeRef } from "./canvas/nodes.js";
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
import { LoopPanel, PassPanel, useLoop } from "./LoopPanel.js";
import { ElementNotes, NotesPanel, useNotes } from "./NotesPanel.js";
import { pinsFor } from "./notes.js";
import { useSelection } from "./selection.js";
import { copy } from "./copy.js";
import { messageFor } from "./messages.js";
import { elementName } from "./names.js";
import { Columns3, Hand, Monitor, Moon, MousePointer2, Redo2, Smartphone, Sun, Tablet, Undo2 } from "lucide-react";
import { IconButton } from "./Tooltip.js";
import { About, MoreMenu, PagePicker } from "./TopBar.js";
import { MessageText } from "./Toasts.js";
import type { Message } from "./messages.js";

// Pick or create a project; then the canvas (the running app with Skeleton's
// overlay), the selection, and the dev server log.

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<Message | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    call("app:info", null).then(setInfo, (err: unknown) => setError(messageFor(err)));
  }, []);

  async function close() {
    if (!project) return;
    try {
      await call("devserver:stop", { projectRoot: project.projectRoot });
    } catch (err) {
      setError(messageFor(err));
    }
    setProject(null);
  }

  return (
    <main>
      {!project && (
        <header className="topbar row">
          <h1>{copy.app.name}</h1>
          <span className="spacer" />
          <MoreMenu about={<About info={info} projectRoot={null} />} />
        </header>
      )}
      {error && <MessageText message={error} />}
      {project ? (
        <ProjectView project={project} info={info} onClose={() => void close()} />
      ) : (
        <ProjectPicker onOpen={setProject} />
      )}
    </main>
  );
}

/** Why gizmos can't edit an element's classes (instance overrides, scale steps), or null when they can. */
function classEditsBlocked(node: UiNode): string | null {
  if (node.kind === "locked") return copy.app.classEdits.locked;
  if (!node.id) return copy.app.classEdits.noId;
  if (node.protectedProps.includes("className")) return copy.app.classEdits.agentClassName;
  return null;
}

type Workspace = "build" | "style" | "handoff";
type InspectorTab = "element" | "tokens" | "violations" | "pass";
/** The inspector tab each workspace opens on (layout D). */
const WORKSPACE_TAB: Record<Workspace, InspectorTab> = { build: "element", style: "tokens", handoff: "pass" };

/** The preview widths' icons. */
const LAYOUT_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone, "side-by-side": Columns3 } as const;

/** Shown until the router has been read. */
const DEFAULT_PAGE = "src/pages/HomePage.tsx";

function ProjectView({ project, info, onClose }: { project: ProjectInfo; info: AppInfo | null; onClose: () => void }) {
  const server = useDevServer(project.projectRoot, true);
  const [revision, setRevision] = useState(0);
  const pages = usePages(project.projectRoot, revision);
  const palette = usePalette(project.projectRoot, revision);
  const tokens = useTokens(project.projectRoot, revision);
  const violations = useViolations(project.projectRoot, revision);
  const notes = useNotes(project.projectRoot, revision);
  const loop = useLoop(project.projectRoot, revision);
  // With the agent (T5.2): nothing on the canvas or in the panels can be edited until Take back.
  const withAgent = loop.status?.state === "with-agent";
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
      // Selecting an element always shows the Element tab (layout D).
      if (key !== null) setInspectorTab("element");
    },
    [setSelectedRaw],
  );
  const toasts = useToasts();
  const pushToast = toasts.push;
  // Messages name elements as they are on the page on screen (spec §4).
  const nodesNow = useRef(page.nodes);
  nodesNow.current = page.nodes;
  const fileNow = useRef(file);
  fileNow.current = file;
  /** Shows a failure or refusal in plain words: an error from main, or one of the renderer's own sentences. */
  const setEditError = useCallback(
    (err: unknown, tried?: string) =>
      pushToast(
        "error",
        messageFor(err, {
          element: (id) => {
            const n = nodesNow.current.find((k) => k.node.id === id)?.node;
            return n ? elementName(n) : null;
          },
          page: fileNow.current,
          ...(tried ? { tried } : {}),
        }),
      ),
    [pushToast],
  );
  // Say once per project when edits can't be typechecked (T3.7).
  const warnedUnchecked = useRef(false);
  const noteUnchecked = useCallback(
    (reason: string | null) => {
      if (reason === null || warnedUnchecked.current) return;
      warnedUnchecked.current = true;
      pushToast("warning", messageFor(copy.app.unchecked(reason)));
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
          setEditError(err);
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
          setEditError(err);
        },
      );
    },
    [project.projectRoot, setTokenSheet, setEditError],
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("element");
  // Build | Style | Hand off (T8.7): each has its own left panel and opens its own inspector tab.
  const [workspace, setWorkspaceRaw] = useState<Workspace>("build");
  const [leftTab, setLeftTab] = useState<"add" | "layers">("add");
  const setWorkspace = (w: Workspace) => {
    setWorkspaceRaw(w);
    setInspectorTab(WORKSPACE_TAB[w]);
  };
  const [noteFocus, setNoteFocus] = useState<string | null>(null);
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
    const blocked = node ? classEditsBlocked(node) : copy.app.classEdits.gone;
    if (!node?.id || blocked) {
      setEditError(copy.app.cantChange(blocked ?? copy.app.classEdits.noId));
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
        setEditError(err);
      },
    );
  };
  const ref = (v: ViolationItem) => ({ file: v.file, offset: v.offset, value: v.value });
  /** Show the page `inFile` is on (if it's a page) and select the element with `id`. */
  const goTo = (inFile: string, id: string | null | undefined) => {
    if (inFile !== file) {
      const target = pages.list?.pages.find((p) => p.file === inFile && !p.dynamic);
      if (target) {
        setPathname(target.path);
        setNavigate({ path: target.path });
      }
    }
    if (id) selectId(id);
  };
  const violationActions = {
    onSelect: (v: ViolationItem) => goTo(v.file, v.element?.id),
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
      setEditError(copy.app.cantMoveThere(dest?.name ?? copy.app.thatElement));
      return;
    }
    if (parentKey === target.parentKey && from === target.index) return; // dropped where it was
    const r = refFor(page.nodes, key);
    if ("reason" in r) {
      setEditError(copy.app.cantMove(moved.name, r.reason));
      return;
    }
    edit({ op: "move", ref: r.ref, newParentId: dest.id, index: target.index });
  };
  // Compose inside a closed Dialog or Sheet (F-6): open it on the canvas with its own trigger.
  const openable = openableFor(page.nodes, selected);
  const [openState, setOpenState] = useState<{ key: string; open: boolean | null } | null>(null);
  const [openRequest, setOpenRequest] = useState<{ key: string; open: boolean } | null>(null);
  const openableOpen = openable !== null && openState?.key === openable ? openState.open : null;
  // Move up / Move down (F-2): the same move, one place among the siblings.
  const reorder = (key: string, direction: "up" | "down"): string | null => {
    const r = reorderTarget(page.nodes, key, direction);
    return "reason" in r ? r.reason : null;
  };
  const reorderNode = (key: string, direction: "up" | "down") => {
    const r = reorderTarget(page.nodes, key, direction);
    if ("reason" in r) return;
    moveNode(key, r);
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
      setEditError(copy.app.cantDelete(reason));
      return;
    }
    const parent = page.nodes.find((n) => n.key === parentKeyOf(key))?.node;
    edit({ op: "remove", ref, allowLocked }, () => (parent?.id ? selectId(parent.id) : setSelectedRaw(null)));
  };
  const requestDelete = (key: string) => {
    const node = page.nodes.find((n) => n.key === key)?.node;
    const { reason } = deletion(key);
    if (!node || reason) {
      setEditError(copy.app.cantDelete(reason ?? copy.app.nothingSelected));
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
      (err: unknown) => !cancelled && setEditError(err),
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
        setEditError(err);
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

  const onShortcut = (key: string, mod: boolean, shift: boolean, alt: boolean) => {
    if (withAgent) return;
    if ((key === "Delete" || key === "Backspace") && !mod && selected) requestDelete(selected);
    else if (alt && (key === "ArrowUp" || key === "ArrowDown") && selected) reorderNode(selected, key === "ArrowUp" ? "up" : "down");
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
      if (isShortcut(e.key, mod, e.altKey)) {
        e.preventDefault();
        latestShortcut.current(e.key, mod, e.shiftKey, e.altKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const canvasDrag = useCanvasDrag((source, target) => {
    const parent = page.nodes.find((n) => n.key === target.parentKey)?.node;
    if (!parent?.id) {
      setEditError(copy.app.cantDropThere(parent?.name ?? copy.app.thatElement));
      return;
    }
    if (source.kind === "palette") edit({ op: "insert", parentId: parent.id, index: target.index, paletteId: source.paletteId });
  });
  // Notes (T5.1, T5.5) and the handoff loop (T5.2–T5.8).
  const setNotesView = notes.set;
  const writeNote = useCallback(
    (op: NoteOp) =>
      call("notes:write", { projectRoot: project.projectRoot, op }).then(setNotesView, (err: unknown) => {
        setEditError(err);
        throw err;
      }),
    [project.projectRoot, setNotesView, setEditError],
  );
  const pins = useMemo(() => pinsFor(notes.view, page.nodes), [notes.view, page.nodes]);
  const openNotes = notes.view?.notes.filter((n) => n.status === "open" && !n.orphaned).length ?? 0;
  const afterLoop = (action: "handoff" | "takeBack" | "revert") => {
    void loop.run(action).then((status) => {
      page.reload();
      setRevision((r) => r + 1);
      if (!status) return;
      if (action === "handoff") setSelectedRaw(null);
      if (action === "takeBack") setInspectorTab("pass");
      if (action === "revert") setCheckPage(true);
    });
  };
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "interact">("select");
  const [layout, setLayout] = useState<PreviewLayout>("desktop");
  const [treeHover, setTreeHover] = useState<string | null>(null);
  // What the overlay last mapped, and for which version of the page file.
  const [mapped, setMapped] = useState<{ version: string; keys: Set<string> } | null>(null);
  const synced = mapped !== null && mapped.version === page.tree?.version && mapped.keys.size > 0;
  const onScreen = mapped !== null && mapped.version === page.tree?.version ? mapped.keys : null;
  const selectedNode = page.nodes.find((n) => n.key === selected) ?? null;

  // The app preview and its log, from the ⋯ menu (T8.6).
  const [appPreview, setAppPreview] = useState(false);

  return (
    <>
      <header className="topbar row">
        <h1>{project.name}</h1>
        <PagePicker current={current?.component ? copy.named.pageComponent(current.component) : null}>
          {(close) => (
            <PagesPanel
              list={pages.list}
              error={pages.error}
              current={current}
              onOpen={(p) => {
                setPathname(p.path);
                setNavigate({ path: p.path });
                close();
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
                  setEditError(err);
                  throw err;
                }
              }}
            />
          )}
        </PagePicker>
        <span className="spacer" />
        <div className="segmented workspaces" role="group" aria-label={copy.workspaces.title}>
          {(["build", "style", "handoff"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={workspace === w} onClick={() => setWorkspace(w)}>
              {copy.workspaces.names[w]}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div className="row history" role="group" aria-label={copy.app.history}>
          <IconButton
            label={copy.app.undo}
            icon={Undo2}
            hint={history.undo ? copy.app.undoTitle(history.undo) : copy.app.nothingToUndo}
            disabled={!history.undo || withAgent}
            onClick={() => historyStep("undo")}
          />
          <IconButton
            label={copy.app.redo}
            icon={Redo2}
            hint={history.redo ? copy.app.redoTitle(history.redo) : copy.app.nothingToRedo}
            disabled={!history.redo || withAgent}
            onClick={() => historyStep("redo")}
          />
        </div>
        <MoreMenu appPreview={appPreview} onAppPreview={() => setAppPreview((o) => !o)} onClose={onClose} about={<About info={info} projectRoot={project.projectRoot} />} />
      </header>
      <div className="project">
      <aside className="sidebar" aria-label={copy.left.title}>
        {page.error && <MessageText message={page.error} />}
        {fsRevision.error && <MessageText message={fsRevision.error} />}
        {page.tree?.rootError && <p className="error">{page.tree.rootError}</p>}
        {!file && pages.list && <p className="muted">{copy.app.noPageFile(pathname)}</p>}
        {workspace === "build" && (
          <>
            <div className="segmented tabs" role="tablist" aria-label={copy.left.title}>
              {(["add", "layers"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={leftTab === t} onClick={() => setLeftTab(t)}>
                  {copy.left[t]}
                </button>
              ))}
            </div>
            {/* Both stay in the page, so the tree keeps what's open. */}
            <div hidden={leftTab !== "add"}>
              <div inert={withAgent} className={withAgent ? "is-inert" : undefined}>
                <PalettePanel
                  palette={palette.palette}
                  error={palette.error}
                  onStartDrag={(item, event) => canvasDrag.start({ kind: "palette", paletteId: item.id, label: item.label }, event)}
                />
              </div>
            </div>
            <div hidden={leftTab !== "layers"}>
              <LayersPanel
                nodes={page.nodes}
                selected={selected}
                hovered={treeHover ?? hovered}
                onScreen={onScreen}
                onSelect={setSelected}
                onHover={setTreeHover}
              />
            </div>
          </>
        )}
        {workspace === "style" && (
          <>
            <LayersPanel
              nodes={page.nodes}
              selected={selected}
              hovered={treeHover ?? hovered}
              onScreen={onScreen}
              onSelect={setSelected}
              onHover={setTreeHover}
            />
            <p className="muted small reach-hint">{copy.left.reach}</p>
          </>
        )}
        {workspace === "handoff" && (
          <NotesPanel
            view={notes.view}
            error={notes.error}
            selected={selectedNode ? { id: selectedNode.node.id, name: elementName(selectedNode.node) } : null}
            focus={noteFocus}
            onFocus={setNoteFocus}
            readOnly={withAgent}
            onWrite={writeNote}
            onSelectTarget={(n: NoteView) => n.file && goTo(n.file, n.target)}
          />
        )}
      </aside>
      <aside className="inspector-panel" aria-label={copy.app.inspector}>
        <div className="segmented tabs" role="tablist" aria-label={copy.app.inspector}>
          {(["element", "tokens", "violations", "pass"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} aria-pressed={inspectorTab === tab} onClick={() => setInspectorTab(tab)}>
              {copy.app.tabs[tab](tab === "violations" ? activeViolations : 0)}
            </button>
          ))}
        </div>
        {inspectorTab === "pass" && (
          <PassPanel projectRoot={project.projectRoot} status={loop.status} busy={loop.busy} onRevert={() => afterLoop("revert")} onSelectId={(id, inFile) => goTo(inFile, id)} />
        )}
        <div inert={withAgent} className={withAgent ? "is-inert" : undefined}>
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
                classEdits={gizmos ? gizmos.classEdits : copy.app.nothingSelected}
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
              cannotMove={selected ? { up: reorder(selected, "up"), down: reorder(selected, "down") } : { up: null, down: null }}
              onMove={(direction) => selected && reorderNode(selected, direction)}
              openable={openable ? { name: page.nodes.find((n) => n.key === openable)?.node.name ?? copy.app.dialogFallback, open: openableOpen } : null}
              onToggleOpen={() => openable && setOpenRequest({ key: openable, open: openableOpen !== true })}
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
        </div>
        {inspectorTab === "element" && selectedNode && (
          <ElementNotes
            view={notes.view}
            selected={{ id: selectedNode.node.id, name: elementName(selectedNode.node) }}
            readOnly={withAgent}
            onWrite={writeNote}
            onSelectTarget={(n: NoteView) => n.file && goTo(n.file, n.target)}
          />
        )}
      </aside>
      <section className="stage" aria-label={copy.canvasBar}>
        <div className="canvas-bar row" role="toolbar" aria-label={copy.canvasBar}>
          <div className="row mode">
            <IconButton
              label={mode === "select" ? copy.app.selectMode : copy.app.interactMode}
              icon={mode === "select" ? MousePointer2 : Hand}
              aria-pressed={mode === "interact"}
              onClick={() => setMode((m) => (m === "select" ? "interact" : "select"))}
            />
          </div>
          <div className="segmented" role="group" aria-label={copy.app.previewWidth}>
            {(["desktop", "tablet", "mobile", "side-by-side"] as const).map((l) => (
              <IconButton key={l} label={copy.app.layouts[l]} icon={LAYOUT_ICONS[l]} aria-pressed={layout === l} onClick={() => setLayout(l)} />
            ))}
          </div>
          <div className="segmented" role="group" aria-label={copy.app.colourMode}>
            <IconButton label={copy.app.light} icon={Sun} aria-pressed={!dark} onClick={() => setDark(false)} />
            <IconButton label={copy.app.dark} icon={Moon} aria-pressed={dark} onClick={() => setDark(true)} />
          </div>
        </div>
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
          pins={pins}
          onPin={(key) => {
            setSelected(key);
            setNoteFocus(page.nodes.find((n) => n.key === key)?.node.id ?? null);
            setInspectorTab("element");
          }}
          withAgent={withAgent ? (loop.status?.handoff?.number ?? 0) : null}
          openWatch={openable}
          openRequest={openRequest}
          onOpenState={(key, open) => setOpenState({ key, open })}
          onTextRequest={(key) => {
            const node = page.nodes.find((n) => n.key === key)?.node;
            if (withAgent || !node || !textEditable(node, palette.palette?.elements[node.name] ?? null)) return null;
            return node.text ?? "";
          }}
          onTextCommit={(key, text) => {
            const id = page.nodes.find((n) => n.key === key)?.node.id;
            if (id && !withAgent) edit({ op: "setText", id, text });
          }}
        />
        <div className="handoff-bar">
          <LoopPanel
            status={loop.status}
            error={loop.error}
            busy={loop.busy}
            openNotes={openNotes}
            onHandoff={() => afterLoop("handoff")}
            onTakeBack={() => afterLoop("takeBack")}
            onReview={() => setInspectorTab("pass")}
          />
        </div>
      </section>
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} onHold={toasts.hold} onAction={(action) => action === "undo" && historyStep("undo")} />
      {canvasDrag.drag && (
        <div className="drag-ghost" style={{ left: canvasDrag.drag.clientX + 12, top: canvasDrag.drag.clientY + 12 }}>
          {canvasDrag.drag.source.label}
        </div>
      )}
      <div className="bottom" hidden={!appPreview}>
        <DevServerPanel server={server} />
      </div>
      </div>
      <footer className="statusbar row" data-testid="status">
        <span className={`status-dot status-${server.status?.state ?? "stopped"}`} aria-hidden="true" />
        <span>{copy.status.app(server.status?.state ?? "stopped")}</span>
        <span className="spacer" />
        <span>{copy.workspaces.purpose[workspace]}</span>
      </footer>
    </>
  );
}
