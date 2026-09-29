import * as t from "@babel/types";
import { diffSources, type SourceDiff } from "./diff.js";
import { EditOpError, ParseError } from "./errors.js";
import { collectIds, UI_ID_ATTR } from "./ids.js";
import { parseJsxExpression, parseModule, printModule } from "./parse.js";
import {
  buildIndexedTree,
  DEFAULT_CATALOGUE,
  findAttr,
  findNodeById,
  type Catalogue,
  type IndexedTree,
  type JsxChild,
  type UiNode,
} from "./tree.js";

export interface EditResult {
  source: string;
  diff: SourceDiff;
}

/** A node addressed by its ID, or by position under an ID'd parent (for un-ID'd locked blocks). */
export type NodeRef = { id: string } | { parentId: string; index: number };

export type PropValue = string | number | boolean | null;

export interface OpOptions {
  catalogue?: Catalogue;
}

// ---------------------------------------------------------------------------
// Public ops

/**
 * Insert `jsx` (a single JSX element) as a child of `parentId` at `index`,
 * counted over node children (elements and expression blocks, not text).
 * Every element in `jsx` must already carry a `data-ui-id` not used in the file.
 */
export function insert(source: string, parentId: string, index: number, jsx: string, options: OpOptions = {}): EditResult {
  const op = "insert";
  return runOp(op, parentId, source, options, (ctx) => {
    const parent = ctx.editable(parentId);
    let node: t.JSXElement;
    try {
      node = parseJsxExpression(jsx);
    } catch (cause) {
      throw new EditOpError(op, parentId, cause instanceof ParseError ? cause.message : String(cause), { cause });
    }
    const newIds: string[] = [];
    t.traverseFast(node, (n) => {
      if (!t.isJSXElement(n)) return;
      const attr = findAttr(n, UI_ID_ATTR);
      const id = attr && t.isStringLiteral(attr.value) ? attr.value.value : null;
      if (!id) throw new EditOpError(op, parentId, `inserted <${nameOf(n)}> has no literal ${UI_ID_ATTR}`);
      newIds.push(id);
    });
    return { removedIds: [], addedIds: newIds, apply: () => insertChild(ctx.source, op, parentId, ctx.element(parent), index, node) };
  });
}

/** Move a node (locked blocks included) to `newParentId` at `index` (position after removal). */
export function move(source: string, ref: NodeRef, newParentId: string, index: number, options: OpOptions = {}): EditResult {
  const op = "move";
  const target = refLabel(ref);
  return runOp(op, target, source, options, (ctx) => {
    const { node, parent } = ctx.resolve(ref);
    const dest = ctx.editable(newParentId);
    if (node === dest || isAncestor(ctx.indexed, node, dest)) {
      throw new EditOpError(op, target, `cannot move a node into itself or its own descendant (${newParentId})`);
    }
    const child = ctx.ast(node);
    return {
      removedIds: [],
      addedIds: [],
      // Moved as text: recast reprints a moved multi-line node with broken
      // indentation. Pass 1 removes the node via the AST and prints. Pass 2
      // re-parses, inserts a placeholder exactly like `insert`, prints, and
      // swaps the placeholder for the node's original source, re-indented.
      apply: () => {
        detachChild(ctx.element(parent), child);
        const removed = printModule(ctx.ast0);
        const ast2 = parseModule(removed);
        const destNode = findNodeById(buildIndexedTree(ast2, options.catalogue ?? DEFAULT_CATALOGUE).tree.roots, newParentId);
        const destAst = destNode ? findElementById(ast2, newParentId) : null;
        if (!destAst) throw new EditOpError(op, target, `${newParentId} not found after removal`);
        insertChild(removed, op, target, destAst, index, placeholderElement());
        const output = printModule(ast2);
        const at = output.indexOf(PLACEHOLDER_TEXT);
        if (at < 0 || output.indexOf(PLACEHOLDER_TEXT, at + 1) >= 0) {
          throw new EditOpError(op, target, "move placeholder not found exactly once in output");
        }
        const prefix = output.slice(output.lastIndexOf("\n", at) + 1, at);
        const newIndent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
        const text = reindent(ctx.source, child, lineIndent(ctx.source, child), newIndent);
        return output.slice(0, at) + text + output.slice(at + PLACEHOLDER_TEXT.length);
      },
    };
  });
}

const PLACEHOLDER_NAME = "__skeleton_move_placeholder__";
const PLACEHOLDER_TEXT = `<${PLACEHOLDER_NAME} />`;

function findElementById(ast: t.File, id: string): t.JSXElement | null {
  let hit: t.JSXElement | null = null;
  t.traverseFast(ast, (n) => {
    if (!hit && t.isJSXElement(n)) {
      const attr = findAttr(n, UI_ID_ATTR);
      if (attr && t.isStringLiteral(attr.value) && attr.value.value === id) hit = n;
    }
  });
  return hit;
}

function placeholderElement(): t.JSXElement {
  return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(PLACEHOLDER_NAME), [], true), null, [], true);
}

/**
 * Original source of `node`, with continuation lines moved from `oldIndent` to
 * `newIndent`. Lines that start inside a template literal are left alone, since
 * their whitespace is part of the string.
 */
function reindent(source: string, node: t.Node, oldIndent: string, newIndent: string): string {
  const start = node.start ?? -1;
  const end = node.end ?? -1;
  if (start < 0 || end < 0) throw new Error("reindent: node has no source position");
  const templates: [number, number][] = [];
  t.traverseFast(node, (n) => {
    if (t.isTemplateLiteral(n) && n.start != null && n.end != null) templates.push([n.start, n.end]);
  });
  const text = source.slice(start, end);
  if (oldIndent === newIndent) return text;
  let out = "";
  let offset = start;
  for (const [i, line] of text.split("\n").entries()) {
    const insideTemplate = templates.some(([a, b]) => offset > a && offset < b);
    if (i === 0) out += line;
    else if (!insideTemplate && line.startsWith(oldIndent)) out += "\n" + newIndent + line.slice(oldIndent.length);
    else out += "\n" + line;
    offset += line.length + 1;
  }
  return out;
}

export interface RemoveOptions extends OpOptions {
  /** Allow removing a node that is, or contains, a locked block. The UI confirms first. */
  allowLocked?: boolean;
}

/** Remove a node and everything under it. */
export function remove(source: string, ref: NodeRef, options: RemoveOptions = {}): EditResult {
  const op = "remove";
  const target = refLabel(ref);
  return runOp(op, target, source, options, (ctx) => {
    const { node, parent } = ctx.resolve(ref);
    if (!options.allowLocked && containsLocked(node)) {
      throw new EditOpError(op, target, "node is or contains a locked block; pass allowLocked to confirm");
    }
    const removedIds: string[] = [];
    t.traverseFast(ctx.ast(node), (n) => {
      if (!t.isJSXElement(n)) return;
      const attr = findAttr(n, UI_ID_ATTR);
      if (attr && t.isStringLiteral(attr.value)) removedIds.push(attr.value.value);
    });
    return { removedIds, addedIds: [], apply: () => detachChild(ctx.element(parent), ctx.ast(node)) };
  });
}

const PROTECTED_PROPS = new Set([UI_ID_ATTR, "className", "style", "key", "ref", "children"]);

/** Set (or with `null`, remove) a literal prop on an editable element. */
export function setProp(source: string, id: string, key: string, value: PropValue, options: OpOptions = {}): EditResult {
  const op = "setProp";
  return runOp(op, id, source, options, (ctx) => {
    if (PROTECTED_PROPS.has(key) || /^on[A-Z]/.test(key) || !/^[A-Za-z][\w-]*$/.test(key)) {
      throw new EditOpError(op, id, `prop "${key}" cannot be set with setProp`);
    }
    const el = ctx.element(ctx.editable(id));
    return {
      removedIds: [],
      addedIds: [],
      apply: () => {
        const attrs = el.openingElement.attributes;
        const existing = findAttr(el, key);
        if (value === null) {
          if (existing) attrs.splice(attrs.indexOf(existing), 1);
          return;
        }
        const attrValue = typeof value === "string" ? t.stringLiteral(value) : t.jsxExpressionContainer(literal(value));
        if (existing) existing.value = attrValue;
        else attrs.push(t.jsxAttribute(t.jsxIdentifier(key), attrValue));
      },
    };
  });
}

/** Add and remove Tailwind classes on an editable element's literal `className`. */
export function setClass(source: string, id: string, add: string[], removeClasses: string[], options: OpOptions = {}): EditResult {
  const op = "setClass";
  return runOp(op, id, source, options, (ctx) => {
    for (const cls of [...add, ...removeClasses]) {
      if (!/^\S+$/.test(cls)) throw new EditOpError(op, id, `invalid class "${cls}"`);
    }
    const el = ctx.element(ctx.editable(id));
    const existing = findAttr(el, "className");
    let current: string[] = [];
    if (existing) {
      if (!t.isStringLiteral(existing.value)) {
        throw new EditOpError(op, id, "className is not a string literal");
      }
      current = existing.value.value.split(/\s+/).filter(Boolean);
    }
    const drop = new Set(removeClasses);
    const next = current.filter((c) => !drop.has(c));
    for (const cls of add) if (!next.includes(cls)) next.push(cls);
    const unchanged = next.length === current.length && next.every((c, i) => c === current[i]);
    return {
      removedIds: [],
      addedIds: [],
      apply: () => {
        if (unchanged) return;
        const attrs = el.openingElement.attributes;
        if (next.length === 0) {
          if (existing) attrs.splice(attrs.indexOf(existing), 1);
        } else if (existing) {
          existing.value = t.stringLiteral(next.join(" "));
        } else {
          attrs.push(t.jsxAttribute(t.jsxIdentifier("className"), t.stringLiteral(next.join(" "))));
        }
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Op runner: parse, plan, apply, print, then verify the result before returning.

interface OpContext {
  source: string;
  /** The parsed module the op mutates. */
  ast0: t.File;
  indexed: IndexedTree;
  /** An editable (non-locked) node by ID. */
  editable(id: string): UiNode;
  /** Any tree node by ref, with its (editable) parent. */
  resolve(ref: NodeRef): { node: UiNode; parent: UiNode };
  ast(node: UiNode): JsxChild;
  element(node: UiNode): t.JSXElement;
}

interface OpPlan {
  removedIds: string[];
  addedIds: string[];
  /** Mutates the AST, or returns the finished source (for text-level ops like move). */
  apply(): void | string;
}

function runOp(op: string, target: string, source: string, options: OpOptions, plan: (ctx: OpContext) => OpPlan): EditResult {
  let ast: t.File;
  try {
    ast = parseModule(source);
  } catch (cause) {
    throw new EditOpError(op, target, `input does not parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  const indexed = buildIndexedTree(ast, options.catalogue ?? DEFAULT_CATALOGUE);
  const roots = indexed.tree.roots;
  const idsBefore = countIds(source);

  const find = (id: string): UiNode => {
    const node = findNodeById(roots, id);
    if (node) return node;
    if (idsBefore.has(id)) throw new EditOpError(op, target, `${id} is inside a locked block`);
    throw new EditOpError(op, target, `${id} not found`);
  };
  const ctx: OpContext = {
    source,
    ast0: ast,
    indexed,
    editable(id) {
      const node = find(id);
      if (node.kind === "locked") throw new EditOpError(op, target, `${id} is a locked block (${node.lockReason ?? "locked"})`);
      return node;
    },
    resolve(ref) {
      if ("id" in ref) {
        const node = find(ref.id);
        const parent = indexed.parentOf.get(node);
        if (!parent) throw new EditOpError(op, target, `${ref.id} is a root and has no parent`);
        return { node, parent };
      }
      const parent = ctx.editable(ref.parentId);
      const node = parent.children[ref.index];
      if (!node) throw new EditOpError(op, target, `${ref.parentId} has no child at index ${ref.index}`);
      return { node, parent };
    },
    ast(node) {
      const n = indexed.astOf.get(node);
      if (!n) throw new EditOpError(op, target, `no AST node for ${node.id ?? node.name}`);
      return n;
    },
    element(node) {
      const n = ctx.ast(node);
      if (!t.isJSXElement(n)) throw new EditOpError(op, target, `${node.id ?? node.name} is not a JSX element`);
      return n;
    },
  };

  const { removedIds, addedIds, apply } = plan(ctx);
  for (const id of addedIds) {
    if (idsBefore.has(id)) throw new EditOpError(op, target, `ID ${id} already exists in this file`);
  }
  const applied = apply();
  const output = typeof applied === "string" ? applied : printModule(ast);

  // Verify: output parses, and IDs survive exactly as expected.
  let idsAfter: Map<string, number>;
  try {
    parseModule(output);
    idsAfter = countIds(output);
  } catch (cause) {
    throw new EditOpError(op, target, `output does not parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  const expected = new Map(idsBefore);
  for (const id of removedIds) expected.set(id, (expected.get(id) ?? 0) - 1);
  for (const id of addedIds) expected.set(id, (expected.get(id) ?? 0) + 1);
  for (const id of new Set([...expected.keys(), ...idsAfter.keys()])) {
    const want = expected.get(id) ?? 0;
    const got = idsAfter.get(id) ?? 0;
    if (want !== got) throw new EditOpError(op, target, `ID check failed for ${id}: expected ${want}, found ${got}`);
  }
  return { source: output, diff: diffSources(source, output) };
}

function countIds(source: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [id] of collectIds(source).ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

// ---------------------------------------------------------------------------
// JSX child list surgery. Ops own the whitespace JSXText around children.

/** Children that count for indexing: everything except text and `{/* comments *\/}`. */
function isNodeChild(child: JsxChild): boolean {
  if (t.isJSXText(child)) return false;
  if (t.isJSXExpressionContainer(child)) {
    return !t.isJSXEmptyExpression(child.expression) && !t.isStringLiteral(child.expression);
  }
  return true;
}

function isBreakingWhitespace(child: JsxChild | undefined): child is t.JSXText {
  return child !== undefined && t.isJSXText(child) && child.value.trim() === "" && child.value.includes("\n");
}

function detachChild(parent: t.JSXElement, child: JsxChild): void {
  const kids = parent.children;
  const i = kids.indexOf(child);
  if (i < 0) throw new Error("detachChild: child not found in parent");
  if (isBreakingWhitespace(kids[i - 1])) kids.splice(i - 1, 2);
  else if (isBreakingWhitespace(kids[i + 1])) kids.splice(i, 2);
  else kids.splice(i, 1);
  if (!kids.some(isNodeChild) && kids.every((k) => t.isJSXText(k) && k.value.trim() === "")) kids.length = 0;
}

function insertChild(source: string, op: string, target: string, parent: t.JSXElement, index: number, child: JsxChild): void {
  const kids = parent.children;
  const nodeIdx = kids.map((k, i) => (isNodeChild(k) ? i : -1)).filter((i) => i >= 0);
  if (!Number.isInteger(index) || index < 0 || index > nodeIdx.length) {
    throw new EditOpError(op, target, `index ${index} out of range (0..${nodeIdx.length})`);
  }
  const parentIndent = lineIndent(source, parent);
  const childIndent = existingChildIndent(kids) ?? parentIndent + "  ";
  const newline = (indent: string) => t.jsxText("\n" + indent);

  if (nodeIdx.length === 0) {
    if (kids.some((k) => t.isJSXText(k) && k.value.trim() !== "")) {
      throw new EditOpError(op, target, "parent has text content; inserting next to text is not supported");
    }
    if (parent.openingElement.selfClosing) {
      parent.openingElement.selfClosing = false;
      parent.closingElement = t.jsxClosingElement(cloneName(parent.openingElement.name));
    }
    kids.splice(0, kids.length, newline(childIndent), child, newline(parentIndent));
    return;
  }
  if (index < nodeIdx.length) {
    const at = nodeIdx[index] as number;
    kids.splice(at, 0, child, newline(childIndent));
  } else {
    const last = nodeIdx[nodeIdx.length - 1] as number;
    kids.splice(last + 1, 0, newline(childIndent), child);
  }
}

function existingChildIndent(kids: JsxChild[]): string | null {
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k && isNodeChild(k)) {
      const prev = kids[i - 1];
      if (isBreakingWhitespace(prev)) return prev.value.slice(prev.value.lastIndexOf("\n") + 1);
      return null;
    }
  }
  return null;
}

function lineIndent(source: string, node: t.Node): string {
  const line = node.loc?.start.line;
  if (line === undefined) return "";
  const text = source.split("\n")[line - 1] ?? "";
  return /^[ \t]*/.exec(text)?.[0] ?? "";
}

function cloneName(name: t.JSXOpeningElement["name"]): t.JSXOpeningElement["name"] {
  return t.cloneNode(name, true, true);
}

function literal(value: number | boolean): t.Expression {
  if (typeof value === "boolean") return t.booleanLiteral(value);
  return value < 0 ? t.unaryExpression("-", t.numericLiteral(-value)) : t.numericLiteral(value);
}

function containsLocked(node: UiNode): boolean {
  return node.kind === "locked" || node.children.some(containsLocked);
}

function isAncestor(indexed: IndexedTree, ancestor: UiNode, node: UiNode): boolean {
  for (let p = indexed.parentOf.get(node); p; p = indexed.parentOf.get(p)) if (p === ancestor) return true;
  return false;
}

function refLabel(ref: NodeRef): string {
  return "id" in ref ? ref.id : `${ref.parentId}[${ref.index}]`;
}

function nameOf(el: t.JSXElement): string {
  const n = el.openingElement.name;
  return t.isJSXIdentifier(n) ? n.name : "element";
}
