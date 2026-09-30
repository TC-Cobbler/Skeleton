import { describe, expect, it } from "vitest";
import type { PageEntry } from "@skeleton/app-main/ipc";
import { matchPage } from "../src/canvas/routes.js";

const page = (path: string, file: string | null): PageEntry => ({ path, component: "X", file, dynamic: /:|\*/.test(path), exists: file !== null });
const pages = [
  page("/", "src/pages/Layout.tsx"),
  page("/", "src/pages/HomePage.tsx"),
  page("/orders", "src/pages/Orders.tsx"),
  page("/orders/:id", "src/pages/Detail.tsx"),
  page("/lazy", null),
  page("/*", "src/pages/NotFound.tsx"),
];

describe("matchPage", () => {
  it("picks the deepest route with a file, static before params", () => {
    expect(matchPage(pages, "/")?.file).toBe("src/pages/HomePage.tsx");
    expect(matchPage(pages, "/orders/")?.file).toBe("src/pages/Orders.tsx");
    expect(matchPage(pages, "/orders/42")?.file).toBe("src/pages/Detail.tsx");
    expect(matchPage(pages, "/lazy")?.file).toBe("src/pages/NotFound.tsx");
    expect(matchPage(pages.slice(0, 4), "/nope")).toBeNull();
  });
});
