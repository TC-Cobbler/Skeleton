import { describe, expect, it } from "vitest";
import type { ElementSchema, UiNode } from "@skeleton/app-main/ipc";
import { acceptsDrop, agentLogicIn, canMove, flatten, parentKeyOf, refFor, toOverlayNodes } from "../src/canvas/nodes.js";

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

describe("refFor and agentLogicIn (T3.4)", () => {
  const tree = {
    roots: [
      n({
        kind: "primitive",
        name: "Stack",
        id: "ui_root1",
        children: [
          n({ kind: "palette", name: "Button", id: "ui_btn01", protectedProps: ["onClick"] }),
          n({ kind: "locked", name: "map", element: false, lockReason: ".map() loop", children: [n({ name: "p", id: "ui_row01" })] }),
          n({ name: "section", id: "ui_sec01", children: [n({ kind: "locked", name: "OrdersTable", id: "ui_ord01", lockReason: "custom component" })] }),
          n({ name: "div", id: null, children: [n({ name: "span", id: null })] }),
        ],
      }),
    ],
    rootError: null,
    version: "v",
  };
  const nodes = flatten(tree);

  it("addresses nodes by ID, or by position under an ID'd parent", () => {
    expect(refFor(nodes, "0.0")).toEqual({ ref: { id: "ui_btn01" } });
    expect(refFor(nodes, "0.1")).toEqual({ ref: { parentId: "ui_root1", index: 1 } });
  });

  it("says why a node can't be removed", () => {
    expect(refFor(nodes, "0")).toEqual({ reason: "The page's root element can't be removed." });
    expect(refFor(nodes, "0.1.0")).toMatchObject({ reason: expect.stringContaining("inside 🔒 map") });
    expect(refFor(nodes, "0.3.0")).toEqual({ reason: "Neither it nor its parent has a data-ui-id." });
    expect(refFor(nodes, "9")).toEqual({ reason: "It's no longer on the page." });
  });

  it("lists the agent code in a subtree", () => {
    const at = (key: string) => nodes.find((k) => k.key === key)?.node as UiNode;
    expect(agentLogicIn(at("0.0"))).toEqual(["onClick on Button #ui_btn01"]);
    expect(agentLogicIn(at("0.1"))).toEqual(["🔒 map (.map() loop)"]);
    expect(agentLogicIn(at("0.2"))).toEqual(["🔒 OrdersTable #ui_ord01 (custom component)"]);
    expect(agentLogicIn(at("0.3"))).toEqual([]);
  });
});
