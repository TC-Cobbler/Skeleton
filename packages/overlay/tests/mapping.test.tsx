import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locChain, NodeIndex } from "../src/mapping.js";
import { Overlay } from "../src/overlay.js";
import type { HostMessage, OverlayMessage, OverlayNode } from "../src/protocol.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const F = "src/pages/HomePage.tsx";
const loc = (offset: number) => ({ "data-skeleton-loc": `${F}:${offset}` });

/** A custom component that doesn't forward unknown props (the common case). */
function Dialog({ children }: { children?: ReactNode }) {
  return (
    <section className="dialog">
      <span className="inner">inside the component</span>
      {children}
    </section>
  );
}

function Page({ rows }: { rows: string[] }) {
  return (
    <div {...loc(10)} id="root-div">
      <Dialog {...(loc(50) as object)}>
        <button {...loc(80)} id="trigger">
          Open
        </button>
      </Dialog>
      {rows.map((r) => (
        <p key={r} {...loc(130)} className="row">
          {r}
        </p>
      ))}
      <em id="plain-text">no loc</em>
    </div>
  );
}

const nodes: OverlayNode[] = [
  { key: "0", kind: "plain", name: "div", id: "ui_root0", lockReason: null, element: true, start: 10, end: 300 },
  { key: "0.0", kind: "locked", name: "Dialog", id: null, lockReason: "custom component", element: true, start: 50, end: 110 },
  { key: "0.0.0", kind: "plain", name: "button", id: "ui_trig0", lockReason: null, element: true, start: 80, end: 105 },
  { key: "0.1", kind: "locked", name: "map", id: null, lockReason: ".map() loop", element: false, start: 115, end: 200 },
  { key: "0.1.0", kind: "plain", name: "p", id: "ui_row00", lockReason: null, element: true, start: 130, end: 190 },
];

let container: HTMLElement;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<Page rows={["a", "b", "c"]} />));
});
afterEach(() => {
  document.body.innerHTML = "";
});
const $ = (sel: string) => document.querySelector(sel) as Element;

describe("locChain", () => {
  it("walks fibers through components that don't render the loc", () => {
    expect(locChain($(".inner"), F)).toEqual([50, 10]);
    expect(locChain($("#trigger"), F)).toEqual([80, 50, 10]);
    expect(locChain($(".row"), F)).toEqual([130, 10]);
    expect(locChain($("#plain-text"), F)).toEqual([10]);
    expect(locChain($(".inner"), "src/pages/Other.tsx")).toEqual([]);
  });
});

describe("NodeIndex", () => {
  const index = () => new NodeIndex(F, nodes);

  it("hits the innermost source element", () => {
    expect(index().hit($("#trigger"))?.key).toBe("0.0.0");
    expect(index().hit($(".inner"))?.key).toBe("0.0");
    expect(index().hit($(".row"))?.key).toBe("0.1.0");
    expect(index().hit($("#plain-text"))?.key).toBe("0");
  });

  it("finds the top-level DOM of each node, including locked blocks", () => {
    const tags = (key: string) =>
      index()
        .elementsOf(nodes.find((n) => n.key === key) as OverlayNode, document.body)
        .map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${e.className ? `.${e.className}` : ""}`);
    expect(tags("0")).toEqual(["div#root-div"]);
    expect(tags("0.0")).toEqual(["section.dialog"]);
    expect(tags("0.0.0")).toEqual(["button#trigger"]);
    expect(tags("0.1")).toEqual(["p.row", "p.row", "p.row"]);
    expect(tags("0.1.0")).toEqual(["p.row", "p.row", "p.row"]);
  });
});

describe("Overlay", () => {
  let overlays: Overlay[] = [];
  afterEach(() => {
    for (const o of overlays) o.destroy();
    overlays = [];
  });

  function setup() {
    const sent: OverlayMessage[] = [];
    const host = { postMessage: vi.fn((m: OverlayMessage) => sent.push(m)) } as unknown as Window;
    // Like a browser: frames run later, when flushed.
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb) => frames.push(cb);
    window.cancelAnimationFrame = () => undefined;
    const flush = () => frames.splice(0).forEach((cb) => cb(0));
    const overlay = new Overlay({ win: window, host });
    overlays.push(overlay);
    overlay.start();
    const send = (data: HostMessage, source: unknown = host) =>
      window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));
    return { sent, send, flush };
  }

  it("announces itself, maps the tree, and selects on click without the app seeing it", () => {
    const { sent, send, flush } = setup();
    expect(sent[0]).toMatchObject({ type: "ready", pathname: "/" });
    send({ source: "skeleton-host", type: "tree", file: F, nodes });
    const mapped = sent.find((m) => m.type === "mapped");
    expect(mapped?.type === "mapped" && mapped.boxes.map((b) => b.key)).toEqual(["0", "0.0", "0.0.0", "0.1", "0.1.0"]);

    const appClick = vi.fn();
    $("#trigger").addEventListener("click", appClick);
    ($("#trigger") as HTMLElement).click();
    expect(appClick).not.toHaveBeenCalled();
    expect(sent.at(-1)).toEqual({ source: "skeleton-overlay", type: "select", key: "0.0.0" });
    const layer = document.querySelector("skeleton-overlay");
    flush();
    expect(layer?.shadowRoot?.innerHTML).toContain("button #ui_trig0");
  });

  it("scrolls to selections made elsewhere, but not to the echo of its own click", () => {
    const { send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, nodes });
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    ($("#trigger") as HTMLElement).click();
    send({ source: "skeleton-host", type: "select", key: "0.0.0" });
    expect(scrolled).not.toHaveBeenCalled();
    send({ source: "skeleton-host", type: "select", key: "0.1.0" });
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it("lets clicks through in interact mode", () => {
    const { sent, send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, nodes });
    send({ source: "skeleton-host", type: "mode", mode: "interact" });
    const appClick = vi.fn();
    $("#trigger").addEventListener("click", appClick);
    const before = sent.length;
    ($("#trigger") as HTMLElement).click();
    expect(appClick).toHaveBeenCalledOnce();
    expect(sent.slice(before).some((m) => m.type === "select")).toBe(false);
  });

  it("toggles .dark on the previewed document", () => {
    const { send } = setup();
    send({ source: "skeleton-host", type: "theme", dark: true });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    send({ source: "skeleton-host", type: "theme", dark: false });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores messages that don't come from the host", () => {
    const { sent, send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, nodes }, window);
    expect(sent.some((m) => m.type === "mapped")).toBe(false);
  });
});

describe("labels", () => {
  it("say what locks a block", async () => {
    const { labelOf } = await import("../src/overlay.js");
    const n = (over: Partial<OverlayNode>): OverlayNode => ({ ...nodes[0], ...over }) as OverlayNode;
    expect(labelOf(n({ kind: "locked", name: "map", element: false, id: null }))).toBe("🔒 .map()");
    expect(labelOf(n({ kind: "locked", name: "conditional", element: false, id: null }))).toBe("🔒 conditional");
    expect(labelOf(n({ kind: "locked", name: "expression", element: false, id: null }))).toBe("🔒 {…}");
    expect(labelOf(n({ kind: "locked", name: "OrdersTable", element: true, id: "ui_ordt1" }))).toBe("🔒 OrdersTable #ui_ordt1");
    expect(labelOf(n({ kind: "palette", name: "Button", id: "ui_b1234" }))).toBe("Button #ui_b1234");
  });
});

describe("deepestAt", () => {
  it("finds pointer-events: none children (disabled buttons) under the point", async () => {
    const { deepestAt } = await import("../src/overlay.js");
    document.body.innerHTML = `<div id="stack"><button id="prev" disabled style="pointer-events:none">Prev</button><button id="next">Next</button></div>`;
    const rect = (x: number, w: number) => ({ left: x, right: x + w, top: 0, bottom: 20, width: w, height: 20, x, y: 0, toJSON: () => ({}) }) as DOMRect;
    ($("#stack") as HTMLElement).getBoundingClientRect = () => rect(0, 200);
    ($("#prev") as HTMLElement).getBoundingClientRect = () => rect(0, 80);
    ($("#next") as HTMLElement).getBoundingClientRect = () => rect(100, 80);
    expect(deepestAt($("#stack"), 40, 10)?.id).toBe("prev");
    expect(deepestAt($("#stack"), 140, 10)?.id).toBe("next");
    expect(deepestAt($("#stack"), 90, 10)?.id).toBe("stack");
  });
});
