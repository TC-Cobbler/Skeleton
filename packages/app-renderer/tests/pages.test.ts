import { describe, expect, it } from "vitest";
import { nameForComponent, pathForName } from "../src/PagesPanel.js";

describe("page names (T3.6)", () => {
  it("suggest a path from a name, and a name from a component", () => {
    expect(pathForName("Order history")).toBe("/order-history");
    expect(pathForName("  Orders  ")).toBe("/orders");
    expect(nameForComponent("OrderHistoryPage")).toBe("Order History");
    expect(nameForComponent("Page")).toBe("Page");
    expect(nameForComponent("Settings2Page")).toBe("Settings2");
  });
});
