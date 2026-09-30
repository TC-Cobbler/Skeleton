import { describe, expect, it } from "vitest";
import { buildTree, walkTree } from "@skeleton/core";
import { componentFor, loadTemplate, pageNameError, pathFor, renderPage, renderProject } from "../src/index.js";

describe("new pages (T3.6)", () => {
  it("derive the component and path from the name", () => {
    expect(componentFor("Orders")).toBe("OrdersPage");
    expect(componentFor("order history")).toBe("OrderHistoryPage");
    expect(componentFor("Landing Page")).toBe("LandingPage");
    expect(pathFor("Order History")).toBe("/order-history");
    expect(pageNameError("Orders 2")).toBeNull();
    expect(pageNameError("2 Orders")).not.toBeNull();
    expect(pageNameError("Orders!")).not.toBeNull();
    expect(pageNameError(" Orders")).not.toBeNull();
  });

  it("render like the home page, editable, with IDs unique in the project", () => {
    const taken = new Set(["ui_aaaaa"]);
    const source = renderPage("Order history", taken);
    const nodes: string[] = [];
    walkTree(buildTree(source).roots, (n) => nodes.push(`${n.kind}:${n.name}:${n.id ? "id" : "none"}`));
    expect(nodes).toEqual(["primitive:Container:id", "primitive:Stack:id", "plain:h1:id"]);
    expect(source).toContain("export default function OrderHistoryPage() {");
    expect(taken.size).toBe(4);
    // Same shape as the scaffolded home page.
    const home = renderProject(loadTemplate(), { name: "Order history", skeletonVersion: "0" })["src/pages/HomePage.tsx"] as string;
    const shape = (s: string) => s.replace(/ui_[a-z0-9]{5}/g, "ID").replace(/function \w+/, "function X");
    expect(shape(source)).toBe(shape(home));
  });
});
