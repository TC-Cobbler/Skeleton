import { describe, expect, it } from "vitest";
import type { ElementSchema, UiNode } from "@skeleton/app-main/ipc";
import { acceptsDrop, canMove, flatten, parentKeyOf, toOverlayNodes } from "../src/canvas/nodes.js";

const range = { start: 0, end: 1, startLine: 1, endLine: 1 };
const n = (over: Partial<UiNode>): UiNode => ({
  kind: "plain",
  id: null,
  name: "div",
  element: true,
  lockReason: null,
  protectedProps: [],
  text: null,
  children: [],
  containedIds: [],
  range,
  ...over,
});
const schema = (name: string, children: ElementSchema["children"]): ElementSchema => ({ name, from: "@/components/ui/x", props: [], children });
const elements = { Stack: schema("Stack", "nodes"), Select: schema("Select", "parts"), Button: schema("Button", "text") };

describe("acceptsDrop (T3.2)", () => {
  it("takes editable, text-free containers with an ID", () => {
    expect(acceptsDrop(n({ kind: "primitive", name: "Stack", id: "ui_s0001" }), elements)).toBe(true);
    expect(acceptsDrop(n({ kind: "plain", name: "section", id: "ui_s0002" }), elements)).toBe(true);
    expect(acceptsDrop(n({ kind: "primitive", name: "Stack", id: null }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "palette", name: "Select", id: "ui_s0003" }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "palette", name: "Button", id: "ui_s0004" }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "plain", name: "div", id: "ui_s0005", text: "hello" }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "plain", name: "h1", id: "ui_s0006" }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "locked", name: "OrdersTable", id: "ui_s0007", lockReason: "custom component" }), elements)).toBe(false);
    expect(acceptsDrop(n({ kind: "primitive", name: "Unknown", id: "ui_s0008" }), elements)).toBe(false);
  });
});

describe("canMove (T3.3)", () => {
  const stack = n({ kind: "primitive", name: "Stack", id: "ui_stack" });
  it("moves children of editable elements, locked blocks included", () => {
    expect(canMove(n({ id: "ui_btn01" }), stack)).toBe(true);
    expect(canMove(n({ kind: "locked", name: "map", element: false, lockReason: ".map() loop" }), stack)).toBe(true);
  });
  it("never moves roots, or elements wrapped by a locked block", () => {
    expect(canMove(n({ id: "ui_root1" }), null)).toBe(false);
    expect(canMove(n({ id: "ui_row01" }), n({ kind: "locked", name: "map", element: false }))).toBe(false);
  });
  it("needs an ID on the node or its parent to address it", () => {
    expect(canMove(n({}), n({ kind: "primitive", name: "Stack", id: null }))).toBe(false);
  });
});

describe("toOverlayNodes", () => {
  it("flags drop targets and movable nodes by key", () => {
    const tree = {
      roots: [n({ kind: "primitive", name: "Stack", id: "ui_root1", children: [n({ id: "ui_a0001" }), n({ kind: "locked", name: "map", element: false })] })],
      rootError: null,
      version: "v",
    };
    const overlay = toOverlayNodes(flatten(tree), elements);
    expect(overlay.map((o) => [o.key, o.drop, o.move])).toEqual([
      ["0", true, false],
      ["0.0", true, true],
      ["0.1", false, true],
    ]);
    expect(parentKeyOf("0.1")).toBe("0");
    expect(parentKeyOf("0")).toBeNull();
  });
});
