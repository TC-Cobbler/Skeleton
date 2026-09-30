// Canvas edits (Phase 3). The renderer sends an edit intent; this module reads the
// page, runs one core edit op (a minimal AST patch) and writes the result. Every
// edit to a project goes through here, one at a time per project.

import path from "node:path";
import { format, resolveConfig } from "prettier";
import { buildIdIndex, EditOpError, fillMissingIds, insert, move, remove, type EditResult } from "@skeleton/core";
import { PALETTE, templateImports } from "@skeleton/templates";
import type { EditIntent, PageEditResult } from "../ipc/contract.js";

export interface EditorIO {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
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
    const previous = this.queues.get(projectRoot) ?? Promise.resolve();
    const next = previous.then(
      () => this.run(projectRoot, file, edit),
      () => this.run(projectRoot, file, edit),
    );
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
      }
    } catch (cause) {
      if (cause instanceof EditOpError) throw new EditRefused(cause.message, { cause });
      throw cause;
    }
    if (result.source !== before) await this.io.writeFile(absolute, result.source);
    return {
      file,
      select,
      patch: result.diff.patch,
      linesAdded: result.diff.linesAdded,
      linesRemoved: result.diff.linesRemoved,
    };
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
