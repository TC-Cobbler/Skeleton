// Router → page list (T2.5). Reads the route objects passed to createBrowserRouter
// (or createHashRouter / createMemoryRouter) and resolves each route's element to
// the page file it's imported from. Pure: callers check the files exist.

import { parse as babelParse } from "@babel/parser";
import * as t from "@babel/types";
import { diffSources } from "./diff.js";
import { EditOpError } from "./errors.js";
import { collectIds } from "./ids.js";
import type { EditResult } from "./ops.js";
import { parseModule } from "./parse.js";

export interface RouteInfo {
  /** Full path, e.g. "/", "/orders", "/orders/:id". */
  path: string;
  /** Component rendered by `element: <X />` or `Component: X`; null if not statically known. */
  component: string | null;
  /** Project-relative page file, e.g. "src/pages/OrdersPage.tsx"; null if not resolvable. */
  file: string | null;
  /** Has `:params` or a `*` splat, so it can't be opened without values. */
  dynamic: boolean;
}

export interface RoutesResult {
  routes: RouteInfo[];
  /** Why routes couldn't be read, or null. */
  error: string | null;
}

const ROUTER_FACTORIES = new Set(["createBrowserRouter", "createHashRouter", "createMemoryRouter"]);

/**
 * @param source   the router file's source
 * @param routerFile its project-relative path (for resolving relative imports)
 */
export function readRoutes(source: string, routerFile = "src/router.tsx"): RoutesResult {
  const ast = parseModule(source);
  const imports = new Map<string, string>();
  for (const stmt of ast.program.body) {
    if (!t.isImportDeclaration(stmt)) continue;
    for (const spec of stmt.specifiers) imports.set(spec.local.name, stmt.source.value);
  }

  let routesArray: t.ArrayExpression | null = null;
  t.traverseFast(ast, (node) => {
    if (routesArray || !t.isCallExpression(node) || !t.isIdentifier(node.callee)) return;
    if (!ROUTER_FACTORIES.has(node.callee.name)) return;
    const arg = node.arguments[0];
    if (t.isArrayExpression(arg)) routesArray = arg;
  });
  if (!routesArray) return { routes: [], error: "no createBrowserRouter([...]) call with an inline route array" };

  const routes: RouteInfo[] = [];
  const visit = (array: t.ArrayExpression, parentPath: string) => {
    for (const el of array.elements) {
      if (!t.isObjectExpression(el)) continue;
      const prop = (name: string) =>
        el.properties.find(
          (p): p is t.ObjectProperty => t.isObjectProperty(p) && (t.isIdentifier(p.key, { name }) || t.isStringLiteral(p.key, { value: name })),
        )?.value;
      const pathValue = prop("path");
      const index = t.isBooleanLiteral(prop("index"), { value: true });
      const own = t.isStringLiteral(pathValue) ? pathValue.value : index ? "" : null;
      const full = own === null ? parentPath : joinPath(parentPath, own);

      const element = prop("element");
      const componentProp = prop("Component");
      const component = t.isJSXElement(element) && t.isJSXIdentifier(element.openingElement.name) && /^[A-Z]/.test(element.openingElement.name.name)
        ? element.openingElement.name.name
        : t.isIdentifier(componentProp)
          ? componentProp.name
          : null;
      if (own !== null || component) {
        const from = component ? imports.get(component) : undefined;
        routes.push({
          path: full,
          component,
          file: from ? resolveImport(from, routerFile) : null,
          dynamic: /(^|\/)(:|\*)/.test(full),
        });
      }
      const children = prop("children");
      if (t.isArrayExpression(children)) visit(children, full);
    }
  };
  visit(routesArray, "");
  return { routes, error: null };
}

/**
 * Project files `source` (at project-relative `file`) imports from the project
 * ("./x", "../x", "@/x"), as .tsx paths when no extension is given. Packages are skipped.
 */
export function importedFiles(source: string, file: string): string[] {
  const out: string[] = [];
  for (const stmt of parseModule(source).program.body) {
    if ((t.isImportDeclaration(stmt) || t.isExportNamedDeclaration(stmt) || t.isExportAllDeclaration(stmt)) && stmt.source) {
      const resolved = resolveImport(stmt.source.value, file);
      if (resolved) out.push(resolved);
    }
  }
  return out;
}

function joinPath(parent: string, child: string): string {
  if (child.startsWith("/")) return child;
  const base = parent === "" || parent === "/" ? "" : parent.replace(/\/$/, "");
  return `${base}/${child}`.replace(/\/+$/, "") || "/";
}

/** "./pages/Home" from src/router.tsx → "src/pages/Home.tsx"; "@/pages/Home" → "src/pages/Home.tsx". */
function resolveImport(spec: string, fromFile: string): string | null {
  let rel: string;
  if (spec.startsWith("@/")) rel = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const parts = fromFile.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    rel = parts.join("/");
  } else return null; // a package, not a page
  return /\.(tsx|jsx)$/.test(rel) ? rel : `${rel}.tsx`;
}

// ---------------------------------------------------------------------------
// Router edit ops (T3.6). Text-level splices on the router (and page) source, so
// everything else keeps its exact bytes; the result must parse.


interface RouteEntry {
  obj: t.ObjectExpression;
  array: t.ArrayExpression;
  /** Full path of the parent route ("" at the top level). */
  parentPath: string;
  fullPath: string | null;
  depth: number;
  pathLiteral: t.StringLiteral | null;
  component: string | null;
  hasChildren: boolean;
}

interface RouterFile {
  ast: t.File;
  top: t.ArrayExpression;
  routes: RouteEntry[];
  imports: t.ImportDeclaration[];
  /** Names bound at the top level (imports and declarations). */
  bound: Set<string>;
}

const STATIC_PATH = /^\/([a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*)?$/;
const COMPONENT = /^[A-Z][A-Za-z0-9]{0,63}$/;

function parseRouter(op: string, target: string, source: string): RouterFile {
  let ast: t.File;
  try {
    ast = babelParse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch (cause) {
    throw new EditOpError(op, target, `router doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  let top: t.ArrayExpression | null = null;
  t.traverseFast(ast, (node) => {
    if (top || !t.isCallExpression(node) || !t.isIdentifier(node.callee) || !ROUTER_FACTORIES.has(node.callee.name)) return;
    const arg = node.arguments[0];
    if (t.isArrayExpression(arg)) top = arg;
  });
  if (!top) throw new EditOpError(op, target, "no createBrowserRouter([...]) call with an inline route array");
  const routes: RouteEntry[] = [];
  const visit = (array: t.ArrayExpression, parentPath: string, depth: number) => {
    for (const el of array.elements) {
      if (!t.isObjectExpression(el)) continue;
      const prop = (name: string) =>
        el.properties.find(
          (p): p is t.ObjectProperty => t.isObjectProperty(p) && (t.isIdentifier(p.key, { name }) || t.isStringLiteral(p.key, { value: name })),
        )?.value;
      const pathValue = prop("path");
      const index = t.isBooleanLiteral(prop("index"), { value: true });
      const own = t.isStringLiteral(pathValue) ? pathValue.value : index ? "" : null;
      const full = own === null ? null : joinPath(parentPath, own);
      const element = prop("element");
      const componentProp = prop("Component");
      const component =
        t.isJSXElement(element) && t.isJSXIdentifier(element.openingElement.name) ? element.openingElement.name.name : t.isIdentifier(componentProp) ? componentProp.name : null;
      const children = prop("children");
      routes.push({
        obj: el,
        array,
        parentPath,
        fullPath: full,
        depth,
        pathLiteral: t.isStringLiteral(pathValue) ? pathValue : null,
        component,
        hasChildren: t.isArrayExpression(children) && children.elements.length > 0,
      });
      if (t.isArrayExpression(children)) visit(children, full ?? parentPath, depth + 1);
    }
  };
  visit(top, "", 0);
  const imports = ast.program.body.filter((s): s is t.ImportDeclaration => t.isImportDeclaration(s));
  const bound = new Set<string>();
  for (const stmt of ast.program.body) {
    const decl = t.isExportNamedDeclaration(stmt) || t.isExportDefaultDeclaration(stmt) ? stmt.declaration : stmt;
    if (t.isImportDeclaration(decl)) for (const s of decl.specifiers) bound.add(s.local.name);
    else if ((t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id) bound.add(decl.id.name);
    else if (t.isVariableDeclaration(decl)) for (const d of decl.declarations) if (t.isIdentifier(d.id)) bound.add(d.id.name);
  }
  return { ast, top, routes, imports, bound };
}

type Splice = [start: number, end: number, text: string];

function applySplices(source: string, splices: Splice[]): string {
  let out = source;
  for (const [start, end, text] of [...splices].sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
  return out;
}

function finish(op: string, target: string, before: string, after: string): EditResult {
  try {
    babelParse(after, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch (cause) {
    throw new EditOpError(op, target, `output does not parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  return { source: after, diff: diffSources(before, after) };
}

const pos = (n: t.Node): [number, number] => [n.start ?? -1, n.end ?? -1];

function checkPath(op: string, target: string, router: RouterFile, path: string, except?: RouteEntry): void {
  if (!STATIC_PATH.test(path)) throw new EditOpError(op, target, `"${path}" isn't a page path: use lowercase words and dashes, like /orders or /orders/archive`);
  if (router.routes.some((r) => r !== except && r.fullPath === path && r.component !== null)) {
    throw new EditOpError(op, target, `there's already a route for ${path}`);
  }
}

function checkComponent(op: string, target: string, router: RouterFile, name: string): void {
  if (!COMPONENT.test(name)) throw new EditOpError(op, target, `"${name}" isn't a component name: start with a capital letter, letters and digits only`);
  if (router.bound.has(name)) throw new EditOpError(op, target, `${name} is already used in the router`);
}

/** The path to write in `array` for a full path, relative to the array's parent route. */
function ownPath(op: string, target: string, parentPath: string, full: string): string {
  if (parentPath === "") return full;
  const prefix = parentPath === "/" ? "/" : `${parentPath}/`;
  if (!full.startsWith(prefix)) throw new EditOpError(op, target, `${full} must be under ${parentPath}, where this route lives`);
  return full.slice(prefix.length);
}

function lineIndentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
}

/**
 * Add a page route: `{ path, element: <Component /> }` next to the home page's route
 * (inside its layout route, if it has one), and `import Component from "<pages>/Component"`
 * after the last import, in the style the router already uses.
 */
export function addRoute(source: string, route: { path: string; component: string }): EditResult {
  const op = "addRoute";
  const target = route.path;
  const router = parseRouter(op, target, source);
  checkPath(op, target, router, route.path);
  checkComponent(op, target, router, route.component);

  const homes = router.routes.filter((r) => r.fullPath === "/" && r.component !== null).sort((a, b) => b.depth - a.depth);
  const home = homes[0];
  const array = home ? home.array : router.top;
  const parentPath = home ? home.parentPath : "";
  const own = ownPath(op, target, parentPath, route.path);
  const q = quoteOf(router.imports);
  const entry = `{ path: ${q}${own}${q}, element: <${route.component} /> }`;

  const splices: Splice[] = [];
  const last = array.elements[array.elements.length - 1];
  const [, arrayEnd] = pos(array);
  if (!last) {
    splices.push([arrayEnd - 1, arrayEnd - 1, entry]);
  } else {
    const [lastStart, lastEnd] = pos(last);
    const between = source.slice(lastEnd, arrayEnd - 1);
    const comma = /^\s*,/.exec(between);
    if (between.includes("\n")) {
      const indent = lineIndentAt(source, lastStart);
      if (comma) splices.push([lastEnd + comma[0].length, lastEnd + comma[0].length, `\n${indent}${entry},`]);
      else splices.push([lastEnd, lastEnd, `,\n${indent}${entry}`]);
    } else {
      splices.push([lastEnd, lastEnd, `, ${entry}`]);
    }
  }

  const pagesDir = pagesImportDir(router.imports);
  const lastImport = router.imports[router.imports.length - 1];
  const semi = lastImport && source.slice(pos(lastImport)[0], pos(lastImport)[1]).trimEnd().endsWith(";") ? ";" : "";
  const line = `import ${route.component} from ${q}${pagesDir}${route.component}${q}${semi}`;
  if (lastImport) splices.push([pos(lastImport)[1], pos(lastImport)[1], `\n${line}`]);
  else splices.push([0, 0, `${line}\n`]);
  return finish(op, target, source, applySplices(source, splices));
}

/** Remove the route at `path` (its line, or its text if inline) and its import once unused. */
export function removeRoute(source: string, path: string): EditResult {
  const op = "removeRoute";
  const router = parseRouter(op, path, source);
  const route = oneRoute(op, path, router, path);
  if (route.hasChildren) throw new EditOpError(op, path, `${path} has child routes; remove those first`);
  const splices: Splice[] = [removal(source, route.obj, route.array)];
  if (route.component && references(router.ast, route.component, route.obj) === 0) {
    const imp = importOf(router, route.component);
    if (imp) splices.push(importRemoval(source, imp, route.component));
  }
  return finish(op, path, source, applySplices(source, splices));
}

/** Change a route's path (just the string literal), relative to its layout route. */
export function setRoutePath(source: string, path: string, newPath: string): EditResult {
  const op = "setRoutePath";
  const router = parseRouter(op, path, source);
  const route = oneRoute(op, path, router, path);
  if (!route.pathLiteral) throw new EditOpError(op, path, `${path} is an index route; it takes its layout route's path`);
  if (route.hasChildren) throw new EditOpError(op, path, `${path} has child routes, whose paths would change too`);
  checkPath(op, path, router, newPath, route);
  const own = ownPath(op, path, route.parentPath, newPath);
  const [start, end] = pos(route.pathLiteral);
  return finish(op, path, source, applySplices(source, [[start + 1, end - 1, own]]));
}

/**
 * Rename the component a route renders: its import's local name, the import's file
 * (same folder, new name) and the route's `<Component />` or `Component:`. Refuses if
 * anything else in the router uses the component.
 */
export function renameRouteComponent(source: string, component: string, newComponent: string): EditResult {
  const op = "renameRouteComponent";
  const router = parseRouter(op, component, source);
  checkComponent(op, component, router, newComponent);
  const users = router.routes.filter((r) => r.component === component);
  if (users.length !== 1) throw new EditOpError(op, component, users.length === 0 ? `no route renders ${component}` : `${component} is used by more than one route`);
  const imp = importOf(router, component);
  const spec = imp?.specifiers.find((s) => s.local.name === component);
  if (!imp || !spec || !t.isImportDefaultSpecifier(spec)) throw new EditOpError(op, component, `${component} isn't a default import of a page file`);
  const from = imp.source.value;
  if (!/^(\.{1,2}\/|@\/)/.test(from)) throw new EditOpError(op, component, `${component} comes from a package, not a page file`);
  const route = users[0] as RouteEntry;
  const refs: Splice[] = [];
  t.traverseFast(route.obj, (n) => {
    if ((t.isJSXIdentifier(n) || t.isIdentifier(n)) && n.name === component) refs.push([...pos(n), newComponent]);
  });
  if (references(router.ast, component, route.obj) > 0) throw new EditOpError(op, component, `${component} is used elsewhere in the router`);
  const [srcStart, srcEnd] = pos(imp.source);
  const slash = from.lastIndexOf("/");
  const ext = /\.(tsx|jsx)$/.exec(from)?.[0] ?? "";
  const newFrom = `${from.slice(0, slash + 1)}${newComponent}${ext}`;
  return finish(op, component, source, applySplices(source, [[...pos(spec.local), newComponent], [srcStart + 1, srcEnd - 1, newFrom], ...refs]));
}

/**
 * Rename a page's default-exported component (`export default function Name` or
 * `const Name = …; export default Name`). Refuses if the page's code uses the name.
 */
export function renameDefaultComponent(source: string, newName: string): EditResult {
  const op = "renameDefaultComponent";
  let ast: t.File;
  try {
    ast = babelParse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch (cause) {
    throw new EditOpError(op, newName, `page doesn't parse: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  if (!COMPONENT.test(newName)) throw new EditOpError(op, newName, `"${newName}" isn't a component name`);
  const splices: Splice[] = [];
  let name: string | null = null;
  const owned = new Set<t.Node>();
  for (const stmt of ast.program.body) {
    if (!t.isExportDefaultDeclaration(stmt)) continue;
    const d = stmt.declaration;
    if (t.isFunctionDeclaration(d) && d.id) {
      name = d.id.name;
      owned.add(d.id);
    } else if (t.isIdentifier(d)) {
      name = d.name;
      owned.add(d);
      for (const s of ast.program.body) {
        const decl = t.isExportNamedDeclaration(s) ? s.declaration : s;
        if (t.isFunctionDeclaration(decl) && decl.id?.name === name) owned.add(decl.id);
        if (t.isVariableDeclaration(decl)) for (const v of decl.declarations) if (t.isIdentifier(v.id, { name: name })) owned.add(v.id);
      }
    }
  }
  if (!name || owned.size < (owned.size === 1 ? 1 : 2)) throw new EditOpError(op, newName, "no named default-exported function component");
  const bound = new Set<string>();
  t.traverseFast(ast, (n) => {
    if ((t.isIdentifier(n) || t.isJSXIdentifier(n)) && n.name === newName) bound.add(n.name);
  });
  if (bound.size > 0) throw new EditOpError(op, newName, `${newName} is already used in the page`);
  let others = 0;
  t.traverseFast(ast, (n) => {
    if ((t.isIdentifier(n) || t.isJSXIdentifier(n)) && n.name === name && !owned.has(n)) others++;
  });
  if (others > 0) throw new EditOpError(op, newName, `${name} is used in the page's code; rename it there`);
  for (const n of owned) splices.push([...pos(n), newName]);
  const after = applySplices(source, splices);
  const result = finish(op, newName, source, after);
  const ids = (s: string) => collectIds(s).ids.map(([id]) => id).join(" ");
  if (ids(after) !== ids(source)) throw new EditOpError(op, newName, "IDs changed");
  return result;
}

function oneRoute(op: string, target: string, router: RouterFile, path: string): RouteEntry {
  const matches = router.routes.filter((r) => r.fullPath === path);
  if (matches.length === 0) throw new EditOpError(op, target, `there's no route for ${path}`);
  if (matches.length > 1) throw new EditOpError(op, target, `more than one route has the path ${path}`);
  return matches[0] as RouteEntry;
}

function importOf(router: RouterFile, name: string): t.ImportDeclaration | null {
  return router.imports.find((d) => d.specifiers.some((s) => s.local.name === name)) ?? null;
}

/** Uses of `name` outside its import and outside `except`. */
function references(ast: t.File, name: string, except: t.Node): number {
  const skip = new Set<t.Node>();
  t.traverseFast(except, (n) => {
    skip.add(n);
  });
  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt)) {
      t.traverseFast(stmt, (n) => {
        skip.add(n);
      });
    }
  }
  let count = 0;
  t.traverseFast(ast, (n) => {
    if (!skip.has(n) && (t.isIdentifier(n) || t.isJSXIdentifier(n)) && n.name === name) count++;
  });
  return count;
}

/** Text to delete for one array element: its whole line(s) if it has them to itself, else it and a comma. */
function removal(source: string, el: t.Node, array: t.ArrayExpression): Splice {
  const [start, end] = pos(el);
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const comma = /^[ \t]*,/.exec(source.slice(end));
  const afterComma = end + (comma ? comma[0].length : 0);
  const rest = /^[ \t]*(\n|$)/.exec(source.slice(afterComma));
  if (source.slice(lineStart, start).trim() === "" && rest) return [lineStart, afterComma + rest[0].length, ""];
  if (comma) return [start, afterComma + (/^[ \t]*/.exec(source.slice(afterComma))?.[0].length ?? 0), ""];
  // Last element inline: take the comma before it.
  const before = /,\s*$/.exec(source.slice(pos(array)[0], start));
  return [before ? start - before[0].length : start, end, ""];
}

function importRemoval(source: string, imp: t.ImportDeclaration, name: string): Splice {
  const [start, end] = pos(imp);
  if (imp.specifiers.length === 1) {
    const nl = source[end] === "\n" ? 1 : 0;
    return [start, end + nl, ""];
  }
  const spec = imp.specifiers.find((s) => s.local.name === name) as t.ImportSpecifier;
  const [s, e] = pos(spec);
  const after = /^\s*,\s*/.exec(source.slice(e));
  return after ? [s, e + after[0].length, ""] : [source.slice(0, s).search(/,\s*$/), e, ""];
}

function quoteOf(imports: t.ImportDeclaration[]): string {
  const raw = imports[imports.length - 1]?.source.extra?.["raw"];
  return typeof raw === "string" && raw.startsWith("'") ? "'" : '"';
}

/** Where page imports point, in the router's style: "./pages/" or "@/pages/". */
function pagesImportDir(imports: t.ImportDeclaration[]): string {
  for (const imp of imports) {
    const m = /^((?:\.\/|@\/)pages\/)[^/]+$/.exec(imp.source.value);
    if (m?.[1] && imp.specifiers.some((s) => t.isImportDefaultSpecifier(s))) return m[1];
  }
  return "./pages/";
}
