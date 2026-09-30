import * as t from "@babel/types";
import { UI_ID_ATTR } from "./ids.js";
import { parseModule } from "./parse.js";

export type NodeKind = "palette" | "primitive" | "plain" | "locked";

export interface SourceRange {
  /** Offsets into the source string, end exclusive. */
  start: number;
  end: number;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
}

export interface UiNode {
  kind: NodeKind;
  /** `data-ui-id` if the node carries a literal one. */
  id: string | null;
  /** Element name for elements; component name or expression type for locked blocks. */
  name: string;
  /** Why the node is locked. Null unless `kind === "locked"`. */
  lockReason: string | null;
  /**
   * Props whose values carry logic (non-literal expressions, `key`, `ref`, non-literal
   * `data-ui-id`). The element stays editable; these props are never touched.
   */
  protectedProps: string[];
  /** Direct text content (whitespace-collapsed), null when there is none. */
  text: string | null;
  /**
   * Child nodes. For a locked block these are the JSX elements it wraps that can be
   * edited in place (children of a custom component, conditional branches, a `.map`
   * row template). Their parent is locked, so they can't be moved out, removed, or
   * given new siblings.
   */
  children: UiNode[];
  /** IDs carried anywhere inside a locked block (for reporting). */
  containedIds: string[];
  range: SourceRange;
}

export interface PageTree {
  /** One root per JSX `return` in the default-exported component. */
  roots: UiNode[];
  /** Why no roots were found, if none were. */
  rootError: string | null;
}

export interface Catalogue {
  /** Import sources whose named exports are palette components. */
  palette: RegExp;
  /** Import sources whose named exports are layout primitives. */
  primitive: RegExp;
}

export const DEFAULT_CATALOGUE: Catalogue = {
  palette: /^(@\/|(\.\.?\/)+)components\/ui\/[\w-]+$/,
  primitive: /^(@\/|(\.\.?\/)+)components\/layout(\/[\w-]+)?$/,
};

/** Props that are always protected, whatever their value. */
const ALWAYS_PROTECTED = new Set(["key", "ref"]);

export function buildTree(source: string, catalogue: Catalogue = DEFAULT_CATALOGUE): PageTree {
  return buildIndexedTree(parseModule(source), catalogue).tree;
}

/** Tree plus the AST node behind each tree node, for edit ops. */
export interface IndexedTree {
  tree: PageTree;
  astOf: Map<UiNode, JsxChild>;
  parentOf: Map<UiNode, UiNode>;
}

export type JsxChild = t.JSXElement["children"][number];

export function buildIndexedTree(ast: t.File, catalogue: Catalogue = DEFAULT_CATALOGUE): IndexedTree {
  const imports = collectImports(ast.program);
  const astOf = new Map<UiNode, JsxChild>();
  const parentOf = new Map<UiNode, UiNode>();

  const fn = findDefaultExportFunction(ast.program);
  if (!fn) {
    return { tree: { roots: [], rootError: "no default-exported function component" }, astOf, parentOf };
  }
  const rootExprs = collectReturnedExpressions(fn);
  if (rootExprs.length === 0) {
    return { tree: { roots: [], rootError: "default export returns no JSX" }, astOf, parentOf };
  }

  const classifyElement = (
    el: t.JSXElement,
  ): { kind: NodeKind; name: string; lockReason: string | null; protectedProps: string[] } => {
    const name = elementName(el.openingElement.name);
    const protectedProps: string[] = [];
    for (const attr of el.openingElement.attributes) {
      // A spread can set any prop, className included, so nothing on the element is safe to edit.
      if (t.isJSXSpreadAttribute(attr)) return { kind: "locked", name, lockReason: "spread props", protectedProps: [] };
      const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
      if (ALWAYS_PROTECTED.has(attrName) || !isLiteralAttrValue(attr.value)) protectedProps.push(attrName);
    }
    const tag = el.openingElement.name;
    if (!t.isJSXIdentifier(tag)) return { kind: "locked", name, lockReason: "member or namespaced element", protectedProps };
    if (/^[a-z]/.test(tag.name)) return { kind: "plain", name, lockReason: null, protectedProps };
    const from = imports.get(tag.name);
    if (from !== undefined && catalogue.palette.test(from)) return { kind: "palette", name, lockReason: null, protectedProps };
    if (from !== undefined && catalogue.primitive.test(from)) return { kind: "primitive", name, lockReason: null, protectedProps };
    return { kind: "locked", name, lockReason: "custom component", protectedProps };
  };

  const attach = (parent: UiNode, children: (JsxChild | t.Expression)[]) => {
    for (const child of children) {
      const childNode = visit(child);
      if (childNode) {
        parent.children.push(childNode);
        parentOf.set(childNode, parent);
      }
    }
  };

  const visit = (node: JsxChild | t.Expression): UiNode | null => {
    if (t.isJSXText(node)) return null;
    if (t.isJSXExpressionContainer(node)) {
      if (t.isJSXEmptyExpression(node.expression)) return null; // {/* comment */}
      if (t.isStringLiteral(node.expression)) return null; // {" "} is text
    }
    if (t.isJSXElement(node)) {
      const { kind, name, lockReason, protectedProps } = classifyElement(node);
      const uiNode: UiNode = {
        kind,
        id: readUiId(node),
        name,
        lockReason,
        protectedProps,
        text: kind === "locked" ? null : directText(node),
        children: [],
        containedIds: kind === "locked" ? idsWithin(node, true) : [],
        range: rangeOf(node),
      };
      // A locked element's JSX children are still plain JSX in this file: expose them.
      attach(uiNode, node.children);
      astOf.set(uiNode, node);
      return uiNode;
    }
    const { label, reason } = describeLockedExpression(node);
    const uiNode: UiNode = {
      kind: "locked",
      id: null,
      name: label,
      lockReason: reason,
      protectedProps: [],
      text: null,
      children: [],
      containedIds: idsWithin(node, false),
      range: rangeOf(node),
    };
    attach(uiNode, wrappedElements(node));
    if (isJsxChild(node)) astOf.set(uiNode, node);
    return uiNode;
  };

  const roots: UiNode[] = [];
  for (const expr of rootExprs) {
    const node = visit(expr);
    if (node) roots.push(node);
  }
  return { tree: { roots, rootError: null }, astOf, parentOf };
}

export function walkTree(roots: UiNode[], fn: (node: UiNode, parent: UiNode | null) => void): void {
  const go = (node: UiNode, parent: UiNode | null) => {
    fn(node, parent);
    for (const child of node.children) go(child, node);
  };
  for (const root of roots) go(root, null);
}

export function findNodeById(roots: UiNode[], id: string): UiNode | null {
  let hit: UiNode | null = null;
  walkTree(roots, (node) => {
    if (!hit && node.id === id) hit = node;
  });
  return hit;
}

function isJsxChild(node: t.Node): node is JsxChild {
  return (
    t.isJSXElement(node) ||
    t.isJSXFragment(node) ||
    t.isJSXExpressionContainer(node) ||
    t.isJSXSpreadChild(node) ||
    t.isJSXText(node)
  );
}

/**
 * JSX elements inside a locked expression that can be edited in place: fragment
 * children, conditional branches, and the element a `.map()` callback returns.
 */
function wrappedElements(node: JsxChild | t.Expression): (JsxChild | t.Expression)[] {
  if (t.isJSXFragment(node)) return node.children;
  const expr = t.isJSXExpressionContainer(node) ? node.expression : node;
  if (t.isJSXEmptyExpression(expr) || t.isJSXSpreadChild(expr) || t.isJSXText(expr)) return [];
  const branches = (e: t.Expression): t.Expression[] => {
    // A nested .map() becomes its own locked node, which exposes its row template in turn.
    if (t.isJSXElement(e) || t.isJSXFragment(e) || isMapCall(e)) return [e];
    if (t.isConditionalExpression(e)) return [...branches(e.consequent), ...branches(e.alternate)];
    if (t.isLogicalExpression(e)) return branches(e.right);
    return [];
  };
  if (t.isConditionalExpression(expr) || t.isLogicalExpression(expr)) return branches(expr);
  if (isMapCall(expr)) {
    const callback = expr.arguments[0];
    if (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) {
      return collectReturnedExpressions(callback).flatMap(branches);
    }
  }
  return [];
}

function isMapCall(expr: t.Node): expr is t.CallExpression {
  return t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property, { name: "map" });
}

function describeLockedExpression(node: JsxChild | t.Expression): { label: string; reason: string } {
  if (t.isJSXFragment(node)) return { label: "fragment", reason: "fragment" };
  if (t.isJSXSpreadChild(node)) return { label: "spread", reason: "spread children" };
  const expr = t.isJSXExpressionContainer(node) ? node.expression : node;
  if (isMapCall(expr)) {
    return { label: "map", reason: ".map() loop" };
  }
  if (t.isConditionalExpression(expr) || t.isLogicalExpression(expr)) {
    return { label: "conditional", reason: "conditional" };
  }
  return { label: "expression", reason: `${expr.type} expression` };
}

function collectImports(program: t.Program): Map<string, string> {
  const map = new Map<string, string>();
  for (const stmt of program.body) {
    if (!t.isImportDeclaration(stmt) || stmt.importKind === "type") continue;
    for (const spec of stmt.specifiers) {
      if (t.isImportSpecifier(spec) && spec.importKind === "type") continue;
      map.set(spec.local.name, stmt.source.value);
    }
  }
  return map;
}

type FunctionLike = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;

function findDefaultExportFunction(program: t.Program): FunctionLike | null {
  for (const stmt of program.body) {
    if (!t.isExportDefaultDeclaration(stmt)) continue;
    const decl = stmt.declaration;
    if (t.isFunctionDeclaration(decl) || t.isArrowFunctionExpression(decl) || t.isFunctionExpression(decl)) return decl;
    if (t.isIdentifier(decl)) return findTopLevelFunction(program, decl.name);
    return null;
  }
  return null;
}

function findTopLevelFunction(program: t.Program, name: string): FunctionLike | null {
  for (const stmt of program.body) {
    const decl = t.isExportNamedDeclaration(stmt) ? stmt.declaration : stmt;
    if (t.isFunctionDeclaration(decl) && decl.id?.name === name) return decl;
    if (t.isVariableDeclaration(decl)) {
      for (const d of decl.declarations) {
        if (t.isIdentifier(d.id, { name }) && (t.isArrowFunctionExpression(d.init) || t.isFunctionExpression(d.init))) {
          return d.init;
        }
      }
    }
  }
  return null;
}

/** JSX-ish expressions returned directly by the component (not by nested functions). */
function collectReturnedExpressions(fn: FunctionLike): t.Expression[] {
  if (!t.isBlockStatement(fn.body)) return isJsxRoot(fn.body) ? [fn.body] : [];
  const out: t.Expression[] = [];
  const walk = (node: t.Node) => {
    if (t.isFunction(node) || t.isClass(node)) return;
    if (t.isReturnStatement(node)) {
      if (node.argument && isJsxRoot(node.argument)) out.push(node.argument);
      return;
    }
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
      const value: unknown = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const v of value) if (isNode(v)) walk(v);
      } else if (isNode(value)) {
        walk(value);
      }
    }
  };
  for (const stmt of fn.body.body) walk(stmt);
  return out;
}

function isJsxRoot(expr: t.Node): expr is t.Expression {
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) return true;
  // A conditional/logical return that yields JSX is a locked root.
  let found = false;
  t.traverseFast(expr, (n) => {
    if (t.isJSXElement(n) || t.isJSXFragment(n)) found = true;
  });
  return found && t.isExpression(expr);
}

function isNode(value: unknown): value is t.Node {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function elementName(name: t.JSXOpeningElement["name"]): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return `${elementName(name.object)}.${name.property.name}`;
}

function isLiteralAttrValue(value: t.JSXAttribute["value"]): boolean {
  if (value === null || value === undefined || t.isStringLiteral(value)) return true;
  if (!t.isJSXExpressionContainer(value)) return false; // JSX element as prop value
  const e = value.expression;
  return (
    t.isStringLiteral(e) ||
    t.isNumericLiteral(e) ||
    t.isBooleanLiteral(e) ||
    t.isNullLiteral(e) ||
    (t.isTemplateLiteral(e) && e.expressions.length === 0) ||
    (t.isUnaryExpression(e) && e.operator === "-" && t.isNumericLiteral(e.argument))
  );
}

/** Literal `data-ui-id` value of an element, or null. */
export function readUiId(el: t.JSXElement): string | null {
  const attr = findAttr(el, UI_ID_ATTR);
  if (!attr) return null;
  if (t.isStringLiteral(attr.value)) return attr.value.value;
  if (t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)) {
    return attr.value.expression.value;
  }
  return null;
}

export function findAttr(el: t.JSXElement, name: string): t.JSXAttribute | null {
  for (const attr of el.openingElement.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name })) return attr;
  }
  return null;
}

function directText(el: t.JSXElement): string | null {
  const parts: string[] = [];
  for (const child of el.children) {
    if (t.isJSXText(child)) parts.push(child.value);
    else if (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) parts.push(child.expression.value);
  }
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function idsWithin(node: t.Node, excludeSelf: boolean): string[] {
  const ids: string[] = [];
  t.traverseFast(node, (n) => {
    if (!t.isJSXElement(n) || (excludeSelf && n === node)) return;
    const id = readUiId(n);
    if (id) ids.push(id);
  });
  return ids;
}

function rangeOf(node: t.Node): SourceRange {
  return {
    start: node.start ?? -1,
    end: node.end ?? -1,
    startLine: node.loc?.start.line ?? -1,
    endLine: node.loc?.end.line ?? -1,
  };
}
