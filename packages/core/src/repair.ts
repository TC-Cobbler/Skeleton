// Auto-repair on take-back (T5.6, PRD §11): duplicated IDs are re-minted everywhere
// except where the ID was before the pass, and editable page elements with no ID get
// one. Each repair writes one attribute value on one opening tag, and nothing else.

import * as t from "@babel/types";
import type { Snapshot } from "./analyse.js";
import { EditOpError } from "./errors.js";
import { buildIdIndex, mintId, UI_ID_ATTR, type Random } from "./ids.js";
import { parseModule } from "./parse.js";
import { buildTree, DEFAULT_CATALOGUE, walkTree, type Catalogue } from "./tree.js";

export interface IdRepair {
  kind: "reminted" | "assigned";
  file: string;
  /** 1-based line of the element. */
  line: number;
  element: string;
  /** The ID it has now. */
  id: string;
  /** The duplicated ID it had, for a re-mint. */
  was: string | null;
}

export interface RepairResult {
  /** Changed files only: their new text. */
  files: Snapshot;
  repairs: IdRepair[];
}

export interface RepairOptions {
  /** Page files, where un-ID'd editable elements get IDs. */
  pagesDir?: string;
  catalogue?: Catalogue;
  random?: Random;
}

/** A literal `data-ui-id` attribute: where its value's text is. */
interface IdAttr {
  id: string;
  /** Offsets of the ID inside the quotes. */
  start: number;
  end: number;
  line: number;
  element: string;
  /** The whole element's source, whitespace collapsed. */
  text: string;
}

/**
 * Repair the IDs in `after` (project-relative .tsx/.jsx sources), using `before` (the
 * handoff) to decide which copy of a duplicate keeps its ID: the one in the same file,
 * as the same element, nearest the line it was on. IDs duplicated only by the pass
 * (never seen before) stay on their first occurrence.
 */
export function repairIds(before: Snapshot, after: Snapshot, options: RepairOptions = {}): RepairResult {
  const pagesDir = options.pagesDir ?? "src/pages/";
  const catalogue = options.catalogue ?? DEFAULT_CATALOGUE;
  const jsx = (snap: Snapshot) => Object.fromEntries(Object.entries(snap).filter(([f]) => /\.(tsx|jsx)$/.test(f)));
  const afterFiles = jsx(after);
  const index = buildIdIndex(afterFiles);
  const beforeIds = buildIdIndex(jsx(before)).ids;
  const taken = new Set(index.ids.keys());
  const repairs: IdRepair[] = [];
  /** Per file: text replacements (start, end, text), applied from the end. */
  const edits = new Map<string, { start: number; end: number; text: string }[]>();
  const edit = (file: string, e: { start: number; end: number; text: string }) => {
    const list = edits.get(file) ?? [];
    list.push(e);
    edits.set(file, list);
  };

  // Duplicates: keep one occurrence, re-mint the rest.
  const attrsOf = new Map<string, IdAttr[]>();
  const attrs = (file: string) => {
    let list = attrsOf.get(file);
    if (!list) {
      list = idAttributes(afterFiles[file] as string);
      attrsOf.set(file, list);
    }
    return list;
  };
  for (const id of index.duplicates) {
    const files = [...new Set((index.ids.get(id) ?? []).map((o) => o.file))].sort();
    const occurrences = files.flatMap((file) => attrs(file).filter((a) => a.id === id).map((attr) => ({ file, attr })));
    const was = beforeIds.get(id)?.[0];
    const original = was ? { file: was.file, attr: idAttributes(before[was.file] as string).find((a) => a.id === id) ?? null } : null;
    const keeper = keeperOf(occurrences, original);
    for (const occ of occurrences) {
      if (occ === keeper) continue;
      const next = mintId(taken, options.random);
      edit(occ.file, { start: occ.attr.start, end: occ.attr.end, text: next });
      repairs.push({ kind: "reminted", file: occ.file, line: occ.attr.line, element: occ.attr.element, id: next, was: id });
    }
  }

  // Editable elements in page files with no ID: add one right after the element's name.
  for (const [file, source] of Object.entries(afterFiles)) {
    if (!file.startsWith(pagesDir)) continue;
    walkTree(buildTree(source, catalogue).roots, (node) => {
      if (node.id !== null || node.kind === "locked" || !node.element) return;
      const at = node.range.start + 1 + node.name.length;
      if (source.slice(node.range.start, at) !== `<${node.name}` || !/[\s/>]/.test(source[at] ?? "")) {
        throw new EditOpError("repairIds", `<${node.name}> at ${file}:${node.range.startLine}`, "the element's tag isn't where the tree says");
      }
      const id = mintId(taken, options.random);
      edit(file, { start: at, end: at, text: ` ${UI_ID_ATTR}="${id}"` });
      repairs.push({ kind: "assigned", file, line: node.range.startLine, element: node.name, id, was: null });
    });
  }

  const files: Snapshot = {};
  for (const [file, list] of edits) {
    let out = afterFiles[file] as string;
    for (const e of list.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    files[file] = out;
  }
  return { files, repairs: repairs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) };
}

type Occurrence = { file: string; attr: IdAttr };

/**
 * The copy of a duplicated ID that keeps it: the one unchanged since the handoff if
 * there is one (an agent that copies an element edits the copy), else the one in the
 * same file, as the same element, nearest its old line. A new ID: the first.
 */
function keeperOf(occurrences: Occurrence[], was: { file: string; attr: IdAttr | null } | null): Occurrence | undefined {
  const old = was?.attr;
  if (!was || !old) return occurrences[0];
  let best: Occurrence | undefined;
  let bestScore = -Infinity;
  for (const occ of occurrences) {
    const score =
      (occ.file === was.file ? 4_000_000 : 0) +
      (occ.attr.text === old.text ? 2_000_000 : 0) +
      (occ.attr.element === old.element ? 1_000_000 : 0) -
      Math.abs(occ.attr.line - old.line);
    if (score > bestScore) {
      best = occ;
      bestScore = score;
    }
  }
  return best;
}

/** Every literal `data-ui-id` in a file, in document order, with the offsets of its value. */
function idAttributes(source: string): IdAttr[] {
  const out: IdAttr[] = [];
  t.traverseFast(parseModule(source), (element) => {
    if (!t.isJSXElement(element)) return;
    const node = element.openingElement;
    for (const attr of node.attributes) {
      if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name, { name: UI_ID_ATTR })) continue;
      const literal = t.isStringLiteral(attr.value)
        ? attr.value
        : t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)
          ? attr.value.expression
          : null;
      if (!literal || literal.start == null || literal.end == null) continue;
      const name = t.isJSXIdentifier(node.name) ? node.name.name : "element";
      const text = source.slice(element.start ?? 0, element.end ?? 0).replace(/\s+/g, " ");
      out.push({ id: literal.value, start: literal.start + 1, end: literal.end - 1, line: attr.loc?.start.line ?? -1, element: name, text });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}
