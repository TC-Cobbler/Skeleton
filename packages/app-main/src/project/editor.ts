// Canvas edits (Phase 3). The renderer sends an edit intent; this module reads the
// files, runs core edit ops (minimal patches) and writes the results. Every edit to a
// project goes through here, one at a time per project. An edit is a list of file
// changes, applied in order and rolled back if any of them fails.

import path from "node:path";
import { format, resolveConfig } from "prettier";
import {
  addRoute,
  buildIdIndex,
  buildTree,
  findNodeById,
  diffSources,
  parseModule,
  EditOpError,
  fillMissingIds,
  importedFiles,
  insert,
  move,
  readRoutes,
  remove,
  removeRoute,
  renameDefaultComponent,
  renameRouteComponent,
  setClass,
  setProp,
  setRoutePath,
  setText,
  setTokens,
  TokenError,
  type EditResult,
  type TokenWrite,
  type RouteInfo,
} from "@skeleton/core";
import { componentFor, GLOBALS_CSS, pageNameError, PALETTE, renderPage, templateImports } from "@skeleton/templates";
import type { EditHistory, EditIntent, HistoryStepResult, PageEditResult, PageIntent, PageOpResult } from "../ipc/contract.js";
import { introduced, type Checker, type Diagnostic } from "./checker.js";
import { formatEdited } from "./format.js";

export interface EditorIO {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  deleteFile(absolutePath: string): Promise<void>;
  /** Project-relative paths of every .tsx/.jsx file under src/. */
  listSources(projectRoot: string): Promise<string[]>;
}

/** An edit the op refused (bad target, locked block, …). The message names the op and node. */
export class EditRefused extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EditRefused";
  }
}

/** The edit broke the typecheck, so it was undone (T3.7). */
export class EditRolledBack extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    const shown = diagnostics.slice(0, 3).map((d) => `${d.file}${d.line ? `:${d.line}` : ""}: ${d.message}`);
    const more = diagnostics.length > 3 ? `\n…and ${diagnostics.length - 3} more` : "";
    super(`The edit was undone because it broke the typecheck:\n${shown.join("\n")}${more}`);
    this.name = "EditRolledBack";
  }
}

export interface EditorOptions {
  /** The project's typechecker, or null to skip checking (T3.7). */
  checker?: (projectRoot: string) => Checker | null;
}

/** One undoable step: what it was, and the file changes it made (T3.8). */
interface HistoryEntry {
  label: string;
  changes: FileChange[];
}

/** Steps kept per project for undo. */
const HISTORY_LIMIT = 100;

export class Editor {
  /** Per-project queue: edits apply in order, each against the file as the last one left it. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Per-project undo and redo stacks for this session (T3.8), newest last. */
  private readonly stacks = new Map<string, { undo: HistoryEntry[]; redo: HistoryEntry[] }>();

  constructor(
    private readonly io: EditorIO,
    private readonly options: EditorOptions = {},
  ) {}

  apply(projectRoot: string, file: string, edit: EditIntent): Promise<PageEditResult> {
    return this.enqueue(projectRoot, () => this.run(projectRoot, file, edit));
  }

  /** Add, rename or delete a page: its route in src/router.tsx and its file (T3.6). */
  page(projectRoot: string, intent: PageIntent): Promise<PageOpResult> {
    return this.enqueue(projectRoot, () => this.runPage(projectRoot, intent));
  }

  /**
   * Set token values in globals.css through the token writer (T4.1). One undoable
   * step; CSS isn't typechecked, so it's written as it is.
   */
  tokens(projectRoot: string, writes: readonly TokenWrite[]): Promise<{ file: string; css: string }> {
    return this.enqueue(projectRoot, async () => {
      const before = await this.io.readFile(path.join(projectRoot, GLOBALS_CSS));
      let after: string;
      try {
        after = setTokens(before, writes);
      } catch (cause) {
        if (cause instanceof TokenError) throw new EditRefused(`token write refused: ${cause.message}`, { cause });
        throw cause;
      }
      if (after !== before) {
        const changes = [{ file: GLOBALS_CSS, before, after }];
        await this.commit(projectRoot, changes);
        this.record(projectRoot, tokenLabel(writes), changes);
      }
      return { file: GLOBALS_CSS, css: after };
    });
  }

  /** What Undo and Redo would do next. */
  history(projectRoot: string): Promise<EditHistory> {
    const stack = this.stacks.get(projectRoot);
    return Promise.resolve({ undo: stack?.undo.at(-1)?.label ?? null, redo: stack?.redo.at(-1)?.label ?? null });
  }

  /** Undo the newest step (T3.8): its changes in reverse, checked like any edit. */
  undo(projectRoot: string): Promise<HistoryStepResult> {
    return this.enqueue(projectRoot, () => this.step(projectRoot, "undo"));
  }

  /** Redo the newest undone step. */
  redo(projectRoot: string): Promise<HistoryStepResult> {
    return this.enqueue(projectRoot, () => this.step(projectRoot, "redo"));
  }

  private async step(projectRoot: string, direction: "undo" | "redo"): Promise<HistoryStepResult> {
    const stack = this.stackOf(projectRoot);
    const from = direction === "undo" ? stack.undo : stack.redo;
    const to = direction === "undo" ? stack.redo : stack.undo;
    const entry = from.at(-1);
    if (!entry) throw new EditRefused(`nothing to ${direction}`);
    // Undo turns each change around, newest first; redo replays them as they were.
    const changes =
      direction === "undo" ? [...entry.changes].reverse().map((c) => ({ file: c.file, before: c.after, after: c.before })) : entry.changes;
    // Never overwrite what changed outside Skeleton since: every file must be as the step left it.
    for (const change of changes) {
      const now = await this.io.readFile(path.join(projectRoot, change.file)).catch((err: unknown) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      });
      if (now !== change.before) {
        throw new EditRefused(`can't ${direction} "${entry.label}": ${change.file} changed since, and ${direction === "undo" ? "undoing" : "redoing"} would overwrite that`);
      }
    }
    const unchecked = await this.commitChecked(projectRoot, changes);
    from.pop();
    to.push(entry);
    return { label: entry.label, files: [...new Set(changes.map((c) => c.file))], unchecked, history: await this.history(projectRoot) };
  }

  private stackOf(projectRoot: string): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
    let stack = this.stacks.get(projectRoot);
    if (!stack) {
      stack = { undo: [], redo: [] };
      this.stacks.set(projectRoot, stack);
    }
    return stack;
  }

  /** Remember a committed step; a new step ends what could be redone. */
  private record(projectRoot: string, label: string, changes: FileChange[]): void {
    const stack = this.stackOf(projectRoot);
    stack.undo.push({ label, changes });
    if (stack.undo.length > HISTORY_LIMIT) stack.undo.shift();
    stack.redo = [];
  }

  private enqueue<T>(projectRoot: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectRoot) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(projectRoot, next);
    return next;
  }

  private async run(projectRoot: string, file: string, edit: EditIntent): Promise<PageEditResult> {
    const absolute = path.join(projectRoot, file);
    const before = await this.io.readFile(absolute);
    let result: EditResult;
    let select: string | null = null;
    try {
      switch (edit.op) {
        case "insert": {
          const item = PALETTE.find((p) => p.id === edit.paletteId);
          if (!item?.template) throw new EditRefused(`palette entry ${edit.paletteId} can't be placed`);
          const taken = await this.projectIds(projectRoot);
          const jsx = await formatTemplate(fillMissingIds(item.template, taken), absolute);
          select = /data-ui-id="(ui_[a-z0-9]{5})"/.exec(jsx)?.[1] ?? null;
          result = insert(before, edit.parentId, edit.index, jsx, { imports: templateImports(jsx) });
          break;
        }
        case "move":
          result = move(before, edit.ref, edit.newParentId, edit.index);
          select = "id" in edit.ref ? edit.ref.id : null;
          break;
        case "remove":
          result = remove(before, edit.ref, { allowLocked: edit.allowLocked });
          break;
        case "setProp":
          result = setProp(before, edit.id, edit.key, edit.value);
          select = edit.id;
          break;
        case "setText":
          result = setText(before, edit.id, edit.text);
          select = edit.id;
          break;
        case "setClass":
          result = setClass(before, edit.id, edit.add, edit.remove);
          select = edit.id;
          break;
      }
    } catch (cause) {
      if (cause instanceof EditOpError) throw new EditRefused(cause.message, { cause });
      throw cause;
    }
    // Prettier, on the edited node only: an attribute edit can push its tag past the print width.
    let after = result.source;
    if ((edit.op === "setProp" || edit.op === "setClass") && after !== before) {
      after = await formatEdited(after, edit.id, absolute);
      parseModule(after);
    }
    let unchecked: string | null = null;
    if (after !== before) {
      const changes = [{ file, before, after }];
      unchecked = await this.commitChecked(projectRoot, changes);
      this.record(projectRoot, labelFor(edit, before), changes);
    }
    const diff = after === result.source ? result.diff : diffSources(before, after);
    return {
      file,
      select,
      patch: diff.patch,
      linesAdded: diff.linesAdded,
      linesRemoved: diff.linesRemoved,
      unchecked,
    };
  }

  /**
   * Commit, typechecking before and after (T3.7). An edit that introduces errors is
   * rolled back and reported; errors the project already had don't block edits.
   * Returns why the edit couldn't be checked, or null when it was.
   */
  private async commitChecked(projectRoot: string, changes: FileChange[]): Promise<string | null> {
    const checker = this.options.checker?.(projectRoot) ?? null;
    let before: Diagnostic[] | null = null;
    let reason: string | null = checker ? null : "no typechecker";
    if (checker) {
      try {
        before = await checker.check();
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
    }
    await this.commit(projectRoot, changes);
    if (!checker || !before) return reason;
    let after: Diagnostic[];
    try {
      after = await checker.check();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    const broken = introduced(before, after);
    if (broken.length === 0) return null;
    await this.revert(projectRoot, changes);
    await checker.check().catch((error: unknown) => console.warn("[editor] re-check after rollback failed", error));
    throw new EditRolledBack(broken);
  }

  /** Undo applied changes, newest first, skipping any file changed since (never clobber). */
  private async revert(projectRoot: string, changes: FileChange[]): Promise<void> {
    for (const change of [...changes].reverse()) {
      const abs = path.join(projectRoot, change.file);
      const now = await this.io.readFile(abs).catch((err: unknown) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      });
      if (now !== change.after) {
        console.error(`[editor] not rolling back ${change.file}: it changed after the edit`);
        continue;
      }
      if (change.before === null) await this.io.deleteFile(abs);
      else await this.io.writeFile(abs, change.before);
    }
  }

  private async runPage(projectRoot: string, intent: PageIntent): Promise<PageOpResult> {
    const read = (rel: string) => this.io.readFile(path.join(projectRoot, rel));
    const exists = (rel: string) =>
      read(rel).then(
        () => true,
        (err: unknown) => {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw err;
        },
      );
    const router = await read(ROUTER).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new EditRefused(`${ROUTER} not found`);
      throw err;
    });
    const routes = readRoutes(router, ROUTER).routes;
    const pageAt = async (p: string): Promise<RouteInfo & { file: string; component: string }> => {
      const route = routes.find((r) => r.path === p && r.file !== null && r.component !== null);
      if (!route?.file || !route.component || !(await exists(route.file))) throw new EditRefused(`no page file for ${p}`);
      return { ...route, file: route.file, component: route.component };
    };
    /** Files other than the router that import `file`: renaming or deleting it would break them. */
    const importers = async (file: string): Promise<string[]> => {
      const out: string[] = [];
      for (const rel of await this.io.listSources(projectRoot)) {
        if (rel !== ROUTER && rel !== file && importedFiles(await read(rel), rel).includes(file)) out.push(rel);
      }
      return out;
    };
    const nameError = (name: string) => {
      const error = pageNameError(name);
      if (error) throw new EditRefused(`"${name}" can't name a page: ${error}`);
    };

    return this.refusing(async () => {
      switch (intent.op) {
        case "addPage": {
          nameError(intent.name);
          const component = componentFor(intent.name);
          const nextRouter = addRoute(router, { path: intent.path, component }).source;
          const file = readRoutes(nextRouter, ROUTER).routes.find((r) => r.path === intent.path)?.file;
          if (!file) throw new EditRefused(`the new route for ${intent.path} doesn't resolve to a page file`);
          if (await exists(file)) throw new EditRefused(`${file} already exists`);
          const page = renderPage(intent.name, await this.projectIds(projectRoot));
          const changes = [
            { file, before: null, after: page },
            { file: ROUTER, before: router, after: nextRouter },
          ];
          const unchecked = await this.commitChecked(projectRoot, changes);
          this.record(projectRoot, `Add page ${intent.path}`, changes);
          return { path: intent.path, files: [file, ROUTER], unchecked };
        }
        case "renamePage": {
          const page = await pageAt(intent.path);
          let nextRouter = router;
          const target = intent.newPath ?? intent.path;
          if (intent.newPath !== null && intent.newPath !== intent.path) nextRouter = setRoutePath(nextRouter, intent.path, intent.newPath).source;
          const changes: FileChange[] = [];
          if (intent.name !== null) {
            nameError(intent.name);
            const component = componentFor(intent.name);
            if (component !== page.component) {
              const users = await importers(page.file);
              if (users.length > 0) throw new EditRefused(`${page.file} is imported by ${users.join(", ")}; rename it in code`);
              nextRouter = renameRouteComponent(nextRouter, page.component, component).source;
              const file = readRoutes(nextRouter, ROUTER).routes.find((r) => r.path === target)?.file;
              if (!file) throw new EditRefused(`the renamed route doesn't resolve to a page file`);
              if (await exists(file)) throw new EditRefused(`${file} already exists`);
              const source = await read(page.file);
              changes.push({ file, before: null, after: renameDefaultComponent(source, component).source });
              changes.push({ file: page.file, before: source, after: null });
            }
          }
          if (nextRouter !== router) changes.unshift({ file: ROUTER, before: router, after: nextRouter });
          const unchecked = await this.commitChecked(projectRoot, changes);
          if (changes.length > 0) this.record(projectRoot, `Rename page ${intent.path}`, changes);
          return { path: target, files: changes.map((c) => c.file), unchecked };
        }
        case "deletePage": {
          const page = await pageAt(intent.path);
          const others = routes.filter((r) => r.file !== null && r.file !== page.file && r.component !== null);
          if (others.length === 0) throw new EditRefused("it's the only page; add another one first");
          const users = await importers(page.file);
          if (users.length > 0) throw new EditRefused(`${page.file} is imported by ${users.join(", ")}; remove those imports first`);
          const source = await read(page.file);
          const nextRouter = removeRoute(router, intent.path).source;
          const changes = [
            { file: ROUTER, before: router, after: nextRouter },
            { file: page.file, before: source, after: null },
          ];
          const unchecked = await this.commitChecked(projectRoot, changes);
          this.record(projectRoot, `Delete page ${intent.path}`, changes);
          const next = others.find((r) => r.path === "/" && !r.dynamic) ?? others.find((r) => !r.dynamic) ?? null;
          return { path: next?.path ?? null, files: [ROUTER, page.file], unchecked };
        }
      }
    });
  }

  /** Runs core ops, turning their refusals into EditRefused (the file is unchanged). */
  private async refusing<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (cause) {
      if (cause instanceof EditOpError) throw new EditRefused(cause.message, { cause });
      throw cause;
    }
  }

  /**
   * Apply file changes in order (`after: null` deletes; `before: null` creates). If one
   * fails, the ones already applied are undone, so a page op never half-happens.
   */
  private async commit(projectRoot: string, changes: FileChange[]): Promise<void> {
    const done: FileChange[] = [];
    const put = (file: string, content: string | null) =>
      content === null ? this.io.deleteFile(path.join(projectRoot, file)) : this.io.writeFile(path.join(projectRoot, file), content);
    try {
      for (const change of changes) {
        await put(change.file, change.after);
        done.push(change);
      }
    } catch (error) {
      for (const change of done.reverse()) {
        await put(change.file, change.before).catch((undo: unknown) => {
          console.error(`[editor] couldn't roll back ${change.file}`, undo);
        });
      }
      throw error;
    }
  }

  /** Every `data-ui-id` in the project, so new ones are unique project-wide. */
  private async projectIds(projectRoot: string): Promise<Set<string>> {
    const files: Record<string, string> = {};
    for (const rel of await this.io.listSources(projectRoot)) {
      files[rel] = await this.io.readFile(path.join(projectRoot, rel));
    }
    return new Set(buildIdIndex(files).ids.keys());
  }
}

const ROUTER = "src/router.tsx";

/** A short name for an edit, for the Undo and Redo buttons: "Insert Card", "Move Button". */
function labelFor(edit: EditIntent, before: string): string {
  // `before` parsed already: the op ran on it.
  const nameOf = (id: string) => findNodeById(buildTree(before).roots, id)?.name ?? "element";
  switch (edit.op) {
    case "insert":
      return `Insert ${PALETTE.find((p) => p.id === edit.paletteId)?.label ?? "element"}`;
    case "move":
      return `Move ${"id" in edit.ref ? nameOf(edit.ref.id) : "block"}`;
    case "remove":
      return `Delete ${"id" in edit.ref ? nameOf(edit.ref.id) : "block"}`;
    case "setProp":
      return `Set ${edit.key} on ${nameOf(edit.id)}`;
    case "setText":
      return `Edit text of ${nameOf(edit.id)}`;
    case "setClass":
      return `Change layout of ${nameOf(edit.id)}`;
  }
}

/** "Set --radius-button", "Set --primary (dark)", "Set 2 tokens". */
function tokenLabel(writes: readonly TokenWrite[]): string {
  const [first] = writes;
  if (!first || writes.length > 1) return `Set ${writes.length} tokens`;
  return `Set ${first.name}${first.mode === "dark" ? " (dark)" : ""}`;
}

/** One file's change: `before: null` creates it, `after: null` deletes it. */
export interface FileChange {
  file: string;
  before: string | null;
  after: string | null;
}

/**
 * Prettier-format a template on its own, with the project's Prettier config if it
 * has one. Only the new node is formatted; `insert` re-indents it into place.
 */
async function formatTemplate(jsx: string, filepath: string): Promise<string> {
  const config = (await resolveConfig(filepath)) ?? {};
  const formatted = await format(jsx, { ...config, parser: "typescript", filepath });
  return formatted.trim().replace(/;$/, "");
}

type ReadDir = (dir: string, options: { withFileTypes: true }) => Promise<{ name: string; isDirectory(): boolean }[]>;

/** Project-relative .tsx/.jsx files under src/ (skipping node_modules, dist and dotfiles). */
export async function listSources(projectRoot: string, readdir: ReadDir): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string) => {
    for (const entry of await readdir(path.join(projectRoot, rel), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(child);
    }
  };
  await walk("src");
  return out.sort();
}
