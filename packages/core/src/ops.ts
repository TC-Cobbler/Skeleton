import { parse as babelParse } from "@babel/parser";
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

/** A named import an inserted template needs, e.g. `{ name: "Input", from: "@/components/ui/input" }`. */
export interface ImportSpec {
  name: string;
  from: string;
}

export interface InsertOptions extends OpOptions {
  /** Imports to add if the file lacks them. Every component in `jsx` must end up resolvable. */
  imports?: ImportSpec[];
}

/**
 * Insert `jsx` (a single JSX element) as a child of `parentId` at `index`,
 * counted over node children (elements and expression blocks, not text).
 * Every element in `jsx` must already carry a `data-ui-id` not used in the file.
 * The template text is written verbatim (re-indented), so format it first.
 */
export function insert(source: string, parentId: string, index: number, jsx: string, options: InsertOptions = {}): EditResult {
  const op = "insert";
  return runOp(op, parentId, source, options, (ctx) => {
    const parent = ctx.editable(parentId);
    const template = jsx.trim();
    let node: t.JSXElement;
    try {
      node = parseJsxExpression(template);
    } catch (cause) {
      throw new EditOpError(op, parentId, cause instanceof ParseError ? cause.message : String(cause), { cause });
    }
    const newIds: string[] = [];
    const components = new Set<string>();
    t.traverseFast(node, (n) => {
      if (t.isJSXOpeningElement(n) && t.isJSXIdentifier(n.name) && /^[A-Z]/.test(n.name.name)) components.add(n.name.name);
      if (t.isJSXOpeningElement(n) && t.isJSXMemberExpression(n.name)) {
        throw new EditOpError(op, parentId, "member-expression elements are not supported in templates");
      }
      if (!t.isJSXElement(n)) return;
      const attr = findAttr(n, UI_ID_ATTR);
      const id = attr && t.isStringLiteral(attr.value) ? attr.value.value : null;
      if (!id) throw new EditOpError(op, parentId, `inserted <${nameOf(n)}> has no literal ${UI_ID_ATTR}`);
      newIds.push(id);
    });
    return {
      removedIds: [],
      addedIds: newIds,
      apply: () => {
        const toAdd = importsToAdd(op, parentId, ctx.ast0, options.imports ?? []);
        const bound = topLevelBindings(ctx.ast0);
        for (const spec of toAdd) bound.add(spec.name);
        const missing = [...components].filter((c) => !bound.has(c));
        if (missing.length > 0) {
          throw new EditOpError(op, parentId, `template uses ${missing.join(", ")} but the file doesn't import or declare it; pass imports`);
        }
        insertChild(ctx.source, op, parentId, ctx.element(parent), index, placeholderElement());
        const templateSource = `(${template})`;
        const parsed = parseStandaloneJsx(templateSource);
        const inserted = spliceAtPlaceholder(op, parentId, printModule(ctx.ast0), (indent) =>
          reindent(templateSource, parsed, "", indent),
        );
        return addImportsText(inserted, toAdd);
      },
    };
  });
}

/** Move a node (locked blocks included) to `newParentId` at `index` (position after removal). */
export function move(source: string, ref: NodeRef, newParentId: string, index: number, options: OpOptions = {}): EditResult {
  const op = "move";
  const target = refLabel(ref);
  return runOp(op, target, source, options, (ctx) => {
    const { node, parent } = ctx.resolve(ref);
    ctx.requireMovableParent(node, parent);
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
        return spliceAtPlaceholder(op, target, printModule(ast2), (indent) =>
          reindent(ctx.source, child, lineIndent(ctx.source, child), indent),
        );
      },
    };
  });
}

const PLACEHOLDER_NAME = "__skeleton_placeholder__";
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

/** Replace the single placeholder in `output` with text built for the placeholder's line indent. */
function spliceAtPlaceholder(op: string, target: string, output: string, text: (indent: string) => string): string {
  const at = output.indexOf(PLACEHOLDER_TEXT);
  if (at < 0 || output.indexOf(PLACEHOLDER_TEXT, at + 1) >= 0) {
    throw new EditOpError(op, target, "placeholder not found exactly once in output");
  }
  const prefix = output.slice(output.lastIndexOf("\n", at) + 1, at);
  const indent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
  return output.slice(0, at) + text(indent) + output.slice(at + PLACEHOLDER_TEXT.length);
}

/** Parse `(<jsx/>)` keeping positions; returns the JSX element node. */
function parseStandaloneJsx(wrapped: string): t.JSXElement {
  const file = babelParse(wrapped, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const stmt = file.program.body[0];
  if (!stmt || !t.isExpressionStatement(stmt) || !t.isJSXElement(stmt.expression)) {
    throw new Error("parseStandaloneJsx: expected a JSX element");
  }
  return stmt.expression;
}

/** The specs not already imported. Throws if a name is imported from a different module. */
function importsToAdd(op: string, target: string, ast: t.File, specs: ImportSpec[]): ImportSpec[] {
  const out: ImportSpec[] = [];
  for (const spec of specs) {
    let bound = false;
    for (const stmt of ast.program.body) {
      if (!t.isImportDeclaration(stmt)) continue;
      for (const sp of stmt.specifiers) {
        if (sp.local.name !== spec.name) continue;
        if (stmt.source.value !== spec.from) {
          throw new EditOpError(op, target, `${spec.name} is already imported from "${stmt.source.value}", not "${spec.from}"`);
        }
        bound = true;
      }
    }
    if (!bound && !out.some((o) => o.name === spec.name)) out.push(spec);
  }
  return out;
}

/**
 * Add named imports as text: appended inside an existing `import { … } from "<from>"`
 * (single- or multi-line), or as a new line right after the last import.
 */
function addImportsText(source: string, specs: ImportSpec[]): string {
  let out = source;
  for (const { name, from } of specs) {
    const body = babelParse(out, { sourceType: "module", plugins: ["typescript", "jsx"] }).program.body;
    const imports = body.filter((stmt): stmt is t.ImportDeclaration => t.isImportDeclaration(stmt));
    const existing = imports.find(
      (d) => d.source.value === from && d.importKind !== "type" && d.specifiers.some((sp) => t.isImportSpecifier(sp)),
    );
    if (existing) {
      const named = existing.specifiers.filter((sp) => t.isImportSpecifier(sp));
      const last = named[named.length - 1] as t.ImportSpecifier;
      const lastEnd = last.end ?? 0;
      if (existing.loc?.start.line === existing.loc?.end.line) {
        out = out.slice(0, lastEnd) + `, ${name}` + out.slice(lastEnd);
      } else {
        const lineStart = out.lastIndexOf("\n", last.start ?? 0) + 1;
        const indent = /^[ \t]*/.exec(out.slice(lineStart))?.[0] ?? "  ";
        const comma = /^\s*,/.exec(out.slice(lastEnd));
        out = comma
          ? out.slice(0, lastEnd + comma[0].length) + `\n${indent}${name},` + out.slice(lastEnd + comma[0].length)
          : out.slice(0, lastEnd) + `,\n${indent}${name}` + out.slice(lastEnd);
      }
      continue;
    }
    const lastImport = imports[imports.length - 1];
    const quote = lastImport?.source.extra?.raw?.toString().startsWith("'") ? "'" : '"';
    const line = `import { ${name} } from ${quote}${from}${quote};`;
    out = lastImport ? out.slice(0, lastImport.end ?? 0) + "\n" + line + out.slice(lastImport.end ?? 0) : `${line}\n` + out;
  }
  return out;
}

/** Names bound at the top level of the module (imports and declarations). */
function topLevelBindings(ast: t.File): Set<string> {
  const names = new Set<string>();
  for (const stmt of ast.program.body) {
    const decl = t.isExportNamedDeclaration(stmt) || t.isExportDefaultDeclaration(stmt) ? stmt.declaration : stmt;
    if (t.isImportDeclaration(decl)) for (const spec of decl.specifiers) names.add(spec.local.name);
    else if ((t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id) names.add(decl.id.name);
    else if (t.isVariableDeclaration(decl)) {
      for (const d of decl.declarations) if (t.isIdentifier(d.id)) names.add(d.id.name);
    }
  }
  return names;
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
    else if (!insideTemplate && line.trim() === "") out += "\n";
    else if (!insideTemplate && line.startsWith(oldIndent)) out += "\n" + newIndent + line.slice(oldIndent.length);
    else out += "\n" + line;
    offset += line.length + 1;
  }
  return out;
}

export interface RemoveOptions extends OpOptions {
  /** Allow removing a node that is or contains agent logic (locked blocks, logic-bearing props). The UI confirms first. */
  allowLocked?: boolean;
}

/** Remove a node and everything under it. */
export function remove(source: string, ref: NodeRef, options: RemoveOptions = {}): EditResult {
  const op = "remove";
  const target = refLabel(ref);
  return runOp(op, target, source, options, (ctx) => {
    const { node, parent } = ctx.resolve(ref);
    ctx.requireMovableParent(node, parent);
    if (!options.allowLocked && containsLogic(node)) {
      throw new EditOpError(op, target, "node is or contains agent logic (a locked block or logic-bearing props); pass allowLocked to confirm");
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
    const node = ctx.editable(id);
    if (node.protectedProps.includes(key)) {
      throw new EditOpError(op, id, `prop "${key}" carries agent logic and is protected`);
    }
    const el = ctx.element(node);
    return {
      removedIds: [],
      addedIds: [],
      apply: () => editAttrText(ctx.source, el, key, value === null ? null : attrValueText(value)),
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
        throw new EditOpError(op, id, "className is not a string literal (it carries agent logic and is protected)");
      }
      current = existing.value.value.split(/\s+/).filter(Boolean);
    }
    // Added classes take the place of the first removed one, so a swap
    // (gap-4 → gap-6) stays where it was; otherwise they go at the end.
    const drop = new Set(removeClasses);
    const adding = add.filter((cls, i) => add.indexOf(cls) === i && (drop.has(cls) || !current.includes(cls)));
    const next: string[] = [];
    let placed = false;
    for (const cls of current) {
      if (!drop.has(cls)) next.push(cls);
      else if (!placed) {
        next.push(...adding.filter((a) => !next.includes(a)));
        placed = true;
      }
    }
    for (const cls of adding) if (!next.includes(cls)) next.push(cls);
    const unchanged = next.length === current.length && next.every((c, i) => c === current[i]);
    return {
      removedIds: [],
      addedIds: [],
      apply: () => {
        if (unchanged) return ctx.source;
        return editAttrText(ctx.source, el, "className", next.length === 0 ? null : attrValueText(next.join(" ")));
      },
    };
  });
}

const MAX_TEXT = 10_000;

/**
 * Set the text content of an editable element whose children are only text (or string
 * literals like `{" "}`). Replaces just the text between the tags, keeping it inline or
 * on its own line as it was. Text that JSX would change or reject (`{ } < > &`, edge
 * whitespace, newlines) is written as a string expression: `{"a {b}"}`.
 */
export function setText(source: string, id: string, text: string, options: OpOptions = {}): EditResult {
  const op = "setText";
  return runOp(op, id, source, options, (ctx) => {
    if (text.length > MAX_TEXT) throw new EditOpError(op, id, `text is too long (${text.length} > ${MAX_TEXT} characters)`);
    const el = ctx.element(ctx.editable(id));
    if (el.openingElement.selfClosing || !el.closingElement) {
      throw new EditOpError(op, id, `<${nameOf(el)}> is self-closing and has no text content`);
    }
    for (const child of el.children) {
      if (t.isJSXText(child)) continue;
      if (t.isJSXExpressionContainer(child)) {
        if (t.isStringLiteral(child.expression)) continue;
        if (t.isJSXEmptyExpression(child.expression)) {
          throw new EditOpError(op, id, "its content has a comment; edit it in code so the comment isn't lost");
        }
        throw new EditOpError(op, id, "its text includes an expression (agent logic) and is protected");
      }
      throw new EditOpError(op, id, `<${nameOf(el)}> has child elements; edit their text instead`);
    }
    const from = el.openingElement.end;
    const to = el.closingElement.start;
    if (from == null || to == null) throw new EditOpError(op, id, `<${nameOf(el)}> has no source position`);
    const current = ctx.source.slice(from, to);
    // Text on its own line keeps that layout: newline + indent, text, newline + closing indent.
    const own = /^[ \t]*\n([ \t]*)[\s\S]*\n([ \t]*)$/.exec(current);
    const value = /[{}<>&\n]|^\s|\s$/.test(text) ? `{${JSON.stringify(text)}}` : text;
    const next = own && text !== "" ? `\n${own[1]}${value}\n${own[2]}` : value;
    return {
      removedIds: [],
      addedIds: [],
      apply: () => (next === current ? ctx.source : ctx.source.slice(0, from) + next + ctx.source.slice(to)),
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
  /** Any tree node by ref, with its parent. */
  resolve(ref: NodeRef): { node: UiNode; parent: UiNode };
  /** Throws if `parent` is a locked block: its wrapped elements are edited in place only. */
  requireMovableParent(node: UiNode, parent: UiNode): void;
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
    requireMovableParent(node, parent) {
      if (parent.kind === "locked") {
        throw new EditOpError(
          op,
          target,
          `${node.id ?? node.name} is wrapped by locked ${parent.name} (${parent.lockReason ?? "locked"}); it can be edited in place but not moved out or removed`,
        );
      }
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

/** Source text for a literal JSX attribute value. */
function attrValueText(value: string | number | boolean): string {
  if (typeof value === "string") {
    return value.includes('"') ? `{${JSON.stringify(value)}}` : `"${value}"`;
  }
  return `{${String(value)}}`;
}

/**
 * Set, add or (with `valueText === null`) remove one attribute as a text edit, so
 * the rest of the opening tag keeps its exact layout. A new attribute goes after
 * the last attribute (or the element name); a removed one takes the whitespace
 * before it with it.
 */
function editAttrText(source: string, el: t.JSXElement, key: string, valueText: string | null): string {
  const opening = el.openingElement;
  const existing = findAttr(el, key);
  const pos = (n: t.Node): [number, number] => {
    if (n.start == null || n.end == null) throw new Error(`editAttrText: <${nameOf(el)}> has no source position`);
    return [n.start, n.end];
  };
  if (existing) {
    const [start, end] = pos(existing);
    if (valueText === null) {
      let from = start;
      while (from > 0 && /\s/.test(source[from - 1] as string)) from--;
      return source.slice(0, from) + source.slice(end);
    }
    const valueStart = existing.value ? pos(existing.value)[0] : end;
    const prefix = existing.value ? source.slice(start, valueStart) : `${key}=`;
    return source.slice(0, start) + prefix + valueText + source.slice(existing.value ? pos(existing.value)[1] : end);
  }
  if (valueText === null) return source;
  const last = opening.attributes[opening.attributes.length - 1];
  const at = pos(last ?? opening.name)[1];
  return source.slice(0, at) + ` ${key}=${valueText}` + source.slice(at);
}

function containsLogic(node: UiNode): boolean {
  return node.kind === "locked" || node.protectedProps.length > 0 || node.children.some(containsLogic);
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
