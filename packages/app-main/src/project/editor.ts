// Canvas edits (Phase 3). The renderer sends an edit intent; this module reads the
// files, runs core edit ops (minimal patches) and writes the results. Every edit to a
// project goes through here, one at a time per project. An edit is a list of file
// changes, applied in order and rolled back if any of them fails.

import path from "node:path";
import { format, resolveConfig } from "prettier";
import {
  addRoute,
  buildIdIndex,
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
  type EditResult,
  type RouteInfo,
} from "@skeleton/core";
import { componentFor, pageNameError, PALETTE, renderPage, templateImports } from "@skeleton/templates";
import type { EditIntent, PageEditResult, PageIntent, PageOpResult } from "../ipc/contract.js";

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

export class Editor {
  /** Per-project queue: edits apply in order, each against the file as the last one left it. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly io: EditorIO) {}

  apply(projectRoot: string, file: string, edit: EditIntent): Promise<PageEditResult> {
    return this.enqueue(projectRoot, () => this.run(projectRoot, file, edit));
  }

  /** Add, rename or delete a page: its route in src/router.tsx and its file (T3.6). */
  page(projectRoot: string, intent: PageIntent): Promise<PageOpResult> {
    return this.enqueue(projectRoot, () => this.runPage(projectRoot, intent));
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
    if (result.source !== before) await this.commit(projectRoot, [{ file, before, after: result.source }]);
    return {
      file,
      select,
      patch: result.diff.patch,
      linesAdded: result.diff.linesAdded,
      linesRemoved: result.diff.linesRemoved,
    };
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
          await this.commit(projectRoot, [
            { file, before: null, after: page },
            { file: ROUTER, before: router, after: nextRouter },
          ]);
          return { path: intent.path, files: [file, ROUTER] };
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
          await this.commit(projectRoot, changes);
          return { path: target, files: changes.map((c) => c.file) };
        }
        case "deletePage": {
          const page = await pageAt(intent.path);
          const others = routes.filter((r) => r.file !== null && r.file !== page.file && r.component !== null);
          if (others.length === 0) throw new EditRefused("it's the only page; add another one first");
          const users = await importers(page.file);
          if (users.length > 0) throw new EditRefused(`${page.file} is imported by ${users.join(", ")}; remove those imports first`);
          const source = await read(page.file);
          const nextRouter = removeRoute(router, intent.path).source;
          await this.commit(projectRoot, [
            { file: ROUTER, before: router, after: nextRouter },
            { file: page.file, before: source, after: null },
          ]);
          const next = others.find((r) => r.path === "/" && !r.dynamic) ?? others.find((r) => !r.dynamic) ?? null;
          return { path: next?.path ?? null, files: [ROUTER, page.file] };
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
