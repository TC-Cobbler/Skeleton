// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UiNode } from "@skeleton/app-main/ipc";
import type { KeyedNode } from "../src/canvas/nodes.js";
import { useSelection } from "../src/selection.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node = (key: string, id: string | null, name = "div"): KeyedNode => ({ key, depth: 0, node: { id, name } as UiNode });

/** Every key the hook returned, render by render, and its select functions. */
let renders: (string | null)[];
let api: { select: (key: string | null) => void; selectId: (id: string) => void };
function Probe({ nodes }: { nodes: KeyedNode[] }) {
  const [key, select, selectId] = useSelection(nodes);
  renders.push(key);
  api = { select, selectId };
  return null;
}

let root: Root;
beforeEach(() => {
  renders = [];
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

describe("useSelection", () => {
  it("follows the selected element to its new key in the same render the tree changes (KI-1)", () => {
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", "ui_input"), node("0.1", "ui_badge")]} />));
    act(() => api.select("0.1"));
    renders = [];
    // An element is inserted before the badge: its old key, 0.1, now belongs to the new element.
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", "ui_input"), node("0.1", "ui_new00"), node("0.2", "ui_badge")]} />));
    // Never a render (so never a paint) that shows the element now at the old key.
    expect(renders).not.toContain("0.1");
    expect(renders.at(-1)).toBe("0.2");
  });

  it("never shows an empty selection while the selected element still exists", () => {
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", "ui_input"), node("0.1", "ui_badge")]} />));
    act(() => api.select("0.1"));
    renders = [];
    // The badge moves to a key that didn't exist before.
    const nodes = [node("0", "ui_root0"), node("0.0", "ui_input"), node("0.0.0", "ui_badge")];
    act(() => root.render(<Probe nodes={nodes} />));
    // A key that matches no node is an empty Selection panel.
    expect(renders.filter((k) => !nodes.some((n) => n.key === k))).toEqual([]);
    expect(renders.at(-1)).toBe("0.0.0");
  });

  it("clears when the selected element is gone", () => {
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", "ui_badge")]} />));
    act(() => api.select("0.0"));
    act(() => root.render(<Probe nodes={[node("0", "ui_root0")]} />));
    expect(renders.at(-1)).toBeNull();
  });

  it("picks up an element selected by ID once it's parsed", () => {
    act(() => root.render(<Probe nodes={[node("0", "ui_root0")]} />));
    act(() => api.selectId("ui_new00"));
    expect(renders.at(-1)).toBeNull();
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", "ui_new00")]} />));
    expect(renders.at(-1)).toBe("0.0");
  });

  it("follows an element without an ID by key and name", () => {
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", null, "p")]} />));
    act(() => api.select("0.0"));
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", null, "p"), node("0.1", "ui_new00")]} />));
    expect(renders.at(-1)).toBe("0.0");
    act(() => root.render(<Probe nodes={[node("0", "ui_root0"), node("0.0", null, "span")]} />));
    expect(renders.at(-1)).toBeNull();
  });
});
