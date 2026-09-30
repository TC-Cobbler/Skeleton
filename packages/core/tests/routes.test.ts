import { describe, expect, it } from "vitest";
import { readRoutes } from "../src/index.js";
import { readFixture } from "./helpers.js";

describe("readRoutes", () => {
  it("reads the fixture router", () => {
    expect(readRoutes(readFixture("base/src/router.tsx"))).toEqual({
      routes: [{ path: "/", component: "HomePage", file: "src/pages/HomePage.tsx", dynamic: false }],
      error: null,
    });
  });

  it("handles nesting, index routes, aliases, Component: and unknowns", () => {
    const src = `import { createBrowserRouter } from "react-router";
import Layout from "./pages/Layout";
import Home from "./pages/HomePage";
import Orders from "@/pages/OrdersPage";
import OrderDetail from "./pages/orders/Detail.tsx";
import { Thing } from "some-lib";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "orders", Component: Orders },
      { path: "orders/:id", element: <OrderDetail /> },
      { path: "lazy", lazy: () => import("./pages/Lazy") },
      { path: "thing", element: <Thing /> },
    ],
  },
  { path: "*", element: <p>Not found</p> },
]);`;
    expect(readRoutes(src).routes).toEqual([
      { path: "/", component: "Layout", file: "src/pages/Layout.tsx", dynamic: false },
      { path: "/", component: "Home", file: "src/pages/HomePage.tsx", dynamic: false },
      { path: "/orders", component: "Orders", file: "src/pages/OrdersPage.tsx", dynamic: false },
      { path: "/orders/:id", component: "OrderDetail", file: "src/pages/orders/Detail.tsx", dynamic: true },
      { path: "/lazy", component: null, file: null, dynamic: false },
      { path: "/thing", component: "Thing", file: null, dynamic: false },
      { path: "/*", component: null, file: null, dynamic: true },
    ]);
  });

  it("explains when there's no router array", () => {
    expect(readRoutes(`export const r = 1;`).error).toMatch(/no createBrowserRouter/);
  });
});

// ---------------------------------------------------------------------------
// Router edit ops (T3.6)

import { addRoute, EditOpError, removeRoute, renameDefaultComponent, renameRouteComponent, setRoutePath } from "../src/index.js";
import { assertSurgical, linesOf } from "./helpers.js";

const flat = readFixture("base/src/router.tsx");
const nested = `import { createBrowserRouter } from "react-router";
import Layout from "./pages/Layout";
import Home from "./pages/HomePage";
import Orders from "@/pages/OrdersPage";
import { loader } from "./data";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    loader,
    children: [
      { index: true, element: <Home /> },
      { path: "orders", Component: Orders },
    ],
  },
  { path: "*", element: <p>Not found</p> },
]);
`;

describe("addRoute", () => {
  it("adds a route line and an import line, in the router's style", () => {
    const r = addRoute(flat, { path: "/orders", component: "OrdersPage" });
    assertSurgical(flat, r, [linesOf(flat, "import HomePage"), linesOf(flat, `{ path: "/"`)]);
    expect([r.diff.linesAdded, r.diff.linesRemoved]).toEqual([2, 0]);
    expect(r.source).toContain(`import HomePage from "./pages/HomePage";\nimport OrdersPage from "./pages/OrdersPage";\n`);
    expect(r.source).toContain(`  { path: "/", element: <HomePage /> },\n  { path: "/orders", element: <OrdersPage /> },\n]);`);
    expect(readRoutes(r.source).routes.map((x) => [x.path, x.file])).toEqual([
      ["/", "src/pages/HomePage.tsx"],
      ["/orders", "src/pages/OrdersPage.tsx"],
    ]);
  });

  it("adds next to the home page in a layout route, with a relative path and the import style in use", () => {
    const r = addRoute(nested, { path: "/invoices", component: "InvoicesPage" });
    assertSurgical(nested, r, [linesOf(nested, "import { loader }"), linesOf(nested, `{ path: "orders"`)]);
    expect(r.source).toContain(`      { path: "orders", Component: Orders },\n      { path: "invoices", element: <InvoicesPage /> },\n    ],`);
    expect(r.source).toContain(`import InvoicesPage from "./pages/InvoicesPage";`);
    expect(readRoutes(r.source).routes.find((x) => x.path === "/invoices")?.file).toBe("src/pages/InvoicesPage.tsx");
  });

  it("refuses a path or component that's taken", () => {
    expect(() => addRoute(flat, { path: "/", component: "Other" })).toThrow(/already a route for \//);
    expect(() => addRoute(flat, { path: "/x", component: "HomePage" })).toThrow(/HomePage is already/);
    expect(() => addRoute(flat, { path: "/x", component: "createBrowserRouter" })).toThrow(/isn't a component name/);
    expect(() => addRoute(flat, { path: "/Orders", component: "X" })).toThrow(/isn't a page path/);
    expect(() => addRoute(flat, { path: "/orders/:id", component: "X" })).toThrow(/isn't a page path/);
    expect(() => addRoute(`export const x = 1;`, { path: "/x", component: "X" })).toThrow(EditOpError);
  });
});

describe("removeRoute", () => {
  it("removes the route's line and its now-unused import", () => {
    const added = addRoute(flat, { path: "/orders", component: "OrdersPage" }).source;
    const r = removeRoute(added, "/orders");
    expect(r.source).toBe(flat);
    const n = removeRoute(nested, "/orders");
    assertSurgical(nested, n, [linesOf(nested, "import Orders"), linesOf(nested, `{ path: "orders"`)]);
    expect([n.diff.linesAdded, n.diff.linesRemoved]).toEqual([0, 2]);
  });

  it("keeps an import still used elsewhere, and refuses routes with children or none", () => {
    const shared = flat.replace(`{ path: "/", element: <HomePage /> },`, `{ path: "/", element: <HomePage /> },\n  { path: "/home", element: <HomePage /> },`);
    expect(removeRoute(shared, "/home").source).toContain(`import HomePage from`);
    expect(() => removeRoute(nested, "/nope")).toThrow(/no route for \/nope/);
    expect(() => removeRoute(nested, "/")).toThrow(/more than one route|has child routes/);
  });
});

describe("setRoutePath", () => {
  it("changes only the path literal, relative inside a layout", () => {
    const r = setRoutePath(flat, "/", "/start");
    assertSurgical(flat, r, [linesOf(flat, `{ path: "/"`)]);
    expect(r.source).toContain(`{ path: "/start", element: <HomePage /> }`);
    const n = setRoutePath(nested, "/orders", "/sales");
    expect(n.source).toContain(`{ path: "sales", Component: Orders }`);
    expect([n.diff.linesAdded, n.diff.linesRemoved]).toEqual([1, 1]);
  });

  it("refuses index routes, taken paths and paths outside the layout", () => {
    const withOrders = addRoute(flat, { path: "/orders", component: "OrdersPage" }).source;
    expect(() => setRoutePath(withOrders, "/orders", "/")).toThrow(/already a route for \//);
    expect(() => setRoutePath(nested, "/orders", "/admin/orders").source).not.toThrow();
    expect(() => setRoutePath(`import { createBrowserRouter } from "react-router";\nimport Home from "./Home";\nexport const router = createBrowserRouter([{ path: "/app", children: [{ index: true, element: <Home /> }, { path: "a", element: <Home /> }] }]);\n`, "/app/a", "/b")).toThrow(
      /under \/app/,
    );
  });
});

describe("renameRouteComponent", () => {
  it("renames the import and the element, and points the import at the new file", () => {
    const r = renameRouteComponent(flat, "HomePage", "StartPage");
    assertSurgical(flat, r, [linesOf(flat, "import HomePage"), linesOf(flat, `{ path: "/"`)]);
    expect(r.source).toContain(`import StartPage from "./pages/StartPage";`);
    expect(r.source).toContain(`{ path: "/", element: <StartPage /> }`);
    const n = renameRouteComponent(nested, "Orders", "SalesPage");
    expect(n.source).toContain(`import SalesPage from "@/pages/SalesPage";`);
    expect(n.source).toContain(`{ path: "orders", Component: SalesPage }`);
  });

  it("refuses a name that's taken or a component used elsewhere in the router", () => {
    expect(() => renameRouteComponent(nested, "Orders", "Layout")).toThrow(/Layout is already/);
    const shared = flat.replace(`{ path: "/", element: <HomePage /> },`, `{ path: "/", element: <HomePage /> },\n  { path: "/home", element: <HomePage /> },`);
    expect(() => renameRouteComponent(shared, "HomePage", "StartPage")).toThrow(/used by more than one route/);
  });
});

describe("renameDefaultComponent", () => {
  const page = readFixture("base/src/pages/HomePage.tsx");

  it("renames the page's function, keeping every ID", () => {
    const r = renameDefaultComponent(page, "StartPage");
    assertSurgical(page, r, [linesOf(page, "export default function HomePage")]);
    expect(r.source).toContain("export default function StartPage() {");
  });

  it("renames `export default Name` declarations too, and refuses names used in the page's code", () => {
    const arrow = `const Orders = () => <div data-ui-id="ui_aaaaa" />;\nexport default Orders;\n`;
    expect(renameDefaultComponent(arrow, "Sales").source).toBe(`const Sales = () => <div data-ui-id="ui_aaaaa" />;\nexport default Sales;\n`);
    const used = `export default function Orders() {\n  return <div data-ui-id="ui_aaaaa">{Orders.name}</div>;\n}\n`;
    expect(() => renameDefaultComponent(used, "Sales")).toThrow(/used in the page's code/);
    expect(() => renameDefaultComponent(`export default () => <p />;\n`, "Sales")).toThrow(/no named default-exported function/);
  });
});

describe("importedFiles", () => {
  it("resolves project imports and skips packages", async () => {
    const { importedFiles } = await import("../src/index.js");
    const src = `import a from "./pages/A";\nimport { b } from "@/lib/b";\nimport c from "../c.tsx";\nimport React from "react";\nexport { d } from "./d";\n`;
    expect(importedFiles(src, "src/app/router.tsx")).toEqual(["src/app/pages/A.tsx", "src/lib/b.tsx", "src/c.tsx", "src/app/d.tsx"]);
  });
});
