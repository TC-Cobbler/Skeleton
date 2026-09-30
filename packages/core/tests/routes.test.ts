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
