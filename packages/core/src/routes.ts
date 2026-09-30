// Router → page list (T2.5). Reads the route objects passed to createBrowserRouter
// (or createHashRouter / createMemoryRouter) and resolves each route's element to
// the page file it's imported from. Pure: callers check the files exist.

import * as t from "@babel/types";
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
