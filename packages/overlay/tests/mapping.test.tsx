import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locChain, NodeIndex } from "../src/mapping.js";
import { Overlay } from "../src/overlay.js";
import type { HostMessage, OverlayMessage, OverlayNode } from "../src/protocol.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const F = "src/pages/HomePage.tsx";
const V = "0000000000000a";

/** A custom component that doesn't forward unknown props (the common case). */
function Dialog({ children }: { children?: ReactNode }) {
  return (
    <section className="dialog">
      <span className="inner">inside the component</span>
      {children}
    </section>
  );
}

/** `shift` moves every offset, like an edit above the JSX does after HMR. */
function Page({ rows, shift = 0, version = V }: { rows: string[]; shift?: number; version?: string }) {
  const loc = (offset: number) => ({ "data-skeleton-loc": `${F}:${offset + shift}@${version}` });
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
  { key: "0", kind: "plain", name: "div", id: "ui_root0", lockReason: null, element: true, start: 10, end: 300, drop: true, move: false },
  { key: "0.0", kind: "locked", name: "Dialog", id: null, lockReason: "custom component", element: true, start: 50, end: 110, drop: false, move: true },
  { key: "0.0.0", kind: "plain", name: "button", id: "ui_trig0", lockReason: null, element: true, start: 80, end: 105, drop: false, move: false },
  { key: "0.1", kind: "locked", name: "map", id: null, lockReason: ".map() loop", element: false, start: 115, end: 200, drop: false, move: true },
  { key: "0.1.0", kind: "plain", name: "p", id: "ui_row00", lockReason: null, element: true, start: 130, end: 190, drop: false, move: false },
];

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Page rows={["a", "b", "c"]} />));
});
afterEach(() => {
  document.body.innerHTML = "";
});
const $ = (sel: string) => document.querySelector(sel) as Element;

describe("locChain", () => {
  it("walks fibers through components that don't render the loc", () => {
    expect(locChain($(".inner"), F, V)).toEqual([50, 10]);
    expect(locChain($("#trigger"), F, V)).toEqual([80, 50, 10]);
    expect(locChain($(".row"), F, V)).toEqual([130, 10]);
    expect(locChain($("#plain-text"), F, V)).toEqual([10]);
    expect(locChain($(".inner"), "src/pages/Other.tsx", V)).toEqual([]);
  });

  it("reads the current props after a re-render moves the offsets (HMR)", async () => {
    // React swaps each fiber with its alternate on every render; a DOM node's own
    // fiber pointer can be the stale one, still holding the old offsets.
    for (const shift of [100, 200, 300]) {
      await act(async () => root.render(<Page rows={["a", "b", "c"]} shift={shift} />));
      expect(locChain($("#trigger"), F, V), `shift ${shift}`).toEqual([80 + shift, 50 + shift, 10 + shift]);
      expect(locChain($(".inner"), F, V), `shift ${shift}`).toEqual([50 + shift, 10 + shift]);
      expect(locChain($(".row"), F, V), `shift ${shift}`).toEqual([130 + shift, 10 + shift]);
    }
  });
});

describe("versions", () => {
  it("ignores locs from another version of the file, until the tree catches up", async () => {
    const next = "0000000000000b";
    // The app re-rendered with an edit's new offsets; the tree is still the old one.
    await act(async () => root.render(<Page rows={["a", "b", "c"]} shift={40} version={next} />));
    expect(locChain($("#trigger"), F, V)).toEqual([]);
    expect(new NodeIndex(F, V, nodes).hit($("#trigger"))).toBeNull();
    expect(locChain($("#trigger"), F, next)).toEqual([120, 90, 50]);
  });
});

describe("NodeIndex", () => {
  const index = () => new NodeIndex(F, V, nodes);

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
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
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

  it("drags a gizmo: previews live, commits on release, and keeps the preview until the page updates (T4.3, T4.4)", () => {
    const { sent, send, flush } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    const trigger = $("#trigger") as HTMLElement;
    trigger.classList.add("rounded-button");
    trigger.style.borderTopLeftRadius = "8px";
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 120, 40));
    trigger.click();
    send({
      source: "skeleton-host",
      type: "gizmos",
      key: "0.0.0",
      tokens: [
        { name: "--radius", value: "0.625rem", resolved: null, colour: false },
        { name: "--radius-button", value: "calc(var(--radius) * 0.8)", resolved: "0.5rem", colour: false },
      ],
      spacingSteps: [0, 1, 2, 4],
      classEdits: null,
    });
    flush();
    const shadow = document.querySelector("skeleton-overlay")?.shadowRoot as ShadowRoot;
    const radius = shadow.querySelector('.gz[data-kind="radius"]') as HTMLElement;
    expect(radius).not.toBeNull();
    const pointer = (type: string, target: EventTarget, x: number, y: number, buttons = 1) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
    pointer("pointerdown", radius, 106, 106);
    pointer("pointermove", document, 114, 114);
    const live = document.querySelector("style[data-skeleton-live]");
    expect(live?.textContent).toBe(".rounded-button{border-radius:16px!important}");
    expect(trigger.hasAttribute("data-skeleton-gizmo")).toBe(true);
    flush();
    expect(shadow.innerHTML).toContain("--radius-button: calc(var(--radius) * 1.6)");
    pointer("pointerup", document, 114, 114, 0);
    expect(sent.at(-1)).toEqual({
      source: "skeleton-overlay",
      type: "gizmo-commit",
      key: "0.0.0",
      commit: { kind: "token", name: "--radius-button", value: "calc(var(--radius) * 1.6)" },
    });
    // The click that ends the drag selects nothing.
    const before = sent.length;
    pointer("click", document, 114, 114, 0);
    expect(sent.length).toBe(before);
    send({ source: "skeleton-host", type: "gizmo-done", ok: true });
    expect(document.querySelector("style[data-skeleton-live]")).not.toBeNull();
    send({ source: "skeleton-host", type: "gizmo-done", ok: false });
    expect(document.querySelector("style[data-skeleton-live]")).toBeNull();
    expect(trigger.hasAttribute("data-skeleton-gizmo")).toBe(false);
  });

  it("scrolls to selections made elsewhere, but not to the echo of its own click", () => {
    const { send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
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
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    send({ source: "skeleton-host", type: "mode", mode: "interact" });
    const appClick = vi.fn();
    $("#trigger").addEventListener("click", appClick);
    const before = sent.length;
    ($("#trigger") as HTMLElement).click();
    expect(appClick).toHaveBeenCalledOnce();
    expect(sent.slice(before).some((m) => m.type === "select")).toBe(false);
  });

  it("answers drags with the drop target and draws the indicator (T3.2)", () => {
    const { sent, send, flush } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    // jsdom has no layout: the dialog sits at y 0–40, the rows at y 50–90.
    const box = (y: number, h: number) => () => ({ x: 0, y, left: 0, top: y, right: 100, bottom: y + h, width: 100, height: h, toJSON: () => ({}) }) as DOMRect;
    ($("#root-div") as HTMLElement).getBoundingClientRect = box(0, 100);
    ($(".dialog") as HTMLElement).getBoundingClientRect = box(0, 40);
    ($("#trigger") as HTMLElement).getBoundingClientRect = box(10, 20);
    document.querySelectorAll<HTMLElement>(".row").forEach((el, i) => (el.getBoundingClientRect = box(50 + i * 20, 20)));
    document.elementFromPoint = () => $("#trigger");
    const target = () => {
      const m = sent.at(-1);
      return m?.type === "drop-target" ? m.target : "none";
    };

    // Over the trigger: the Dialog is locked, so the drop goes into the div, between the dialog and the rows.
    send({ source: "skeleton-host", type: "drag", x: 50, y: 30, moving: null, seq: 7 });
    expect(target()).toEqual({ parentKey: "0", index: 1 });
    expect(sent.at(-1)).toMatchObject({ type: "drop-target", seq: 7 });
    flush();
    const html = document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "";
    expect(html).toContain("data-drop-indicator");
    expect(html).toContain("Into div #ui_root0");

    // Moving the dialog itself: never into itself, and indexes count it as taken out.
    send({ source: "skeleton-host", type: "drag", x: 50, y: 30, moving: "0.0", seq: 8 });
    expect(target()).toEqual({ parentKey: "0", index: 0 });

    send({ source: "skeleton-host", type: "drag-end" });
    expect(target()).toBeNull();
    flush();
    expect(document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML).not.toContain("data-drop-indicator");
  });

  it("drops beside a container aimed at its edge, into it aimed at its middle (F-1, F-4)", () => {
    const { sent, send, flush } = setup();
    // Treat the Dialog as an editable container, like a Card in a Stack.
    const editable = nodes.map((n) => (n.key === "0.0" ? { ...n, kind: "palette" as const, drop: true } : n));
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes: editable });
    const box = (y: number, h: number) => () => ({ x: 0, y, left: 0, top: y, right: 100, bottom: y + h, width: 100, height: h, toJSON: () => ({}) }) as DOMRect;
    ($("#root-div") as HTMLElement).getBoundingClientRect = box(0, 100);
    ($(".dialog") as HTMLElement).getBoundingClientRect = box(0, 40);
    ($("#trigger") as HTMLElement).getBoundingClientRect = box(10, 20);
    document.querySelectorAll<HTMLElement>(".row").forEach((el, i) => (el.getBoundingClientRect = box(50 + i * 20, 20)));
    document.elementFromPoint = () => $(".inner");
    const target = () => {
      const m = sent.at(-1);
      return m?.type === "drop-target" ? m.target : "none";
    };
    const label = () => {
      flush();
      return document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "";
    };

    send({ source: "skeleton-host", type: "drag", x: 50, y: 20, moving: null, seq: 1 });
    expect(target()).toMatchObject({ parentKey: "0.0" });
    expect(label()).toContain("Into Dialog");
    // The div is a column: the Dialog's bottom 8px is "after it", its top 8px "before it".
    send({ source: "skeleton-host", type: "drag", x: 50, y: 36, moving: null, seq: 2 });
    expect(target()).toEqual({ parentKey: "0", index: 1 });
    expect(label()).toContain("After Dialog in div #ui_root0");
    send({ source: "skeleton-host", type: "drag", x: 50, y: 3, moving: null, seq: 3 });
    expect(target()).toEqual({ parentKey: "0", index: 0 });
    expect(label()).toContain("Before Dialog in div #ui_root0");

    // The parent doesn't take drops: the edge goes into the container, as before.
    const lockedParent = editable.map((n) => (n.key === "0" ? { ...n, drop: false } : n));
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes: lockedParent });
    send({ source: "skeleton-host", type: "drag", x: 50, y: 36, moving: null, seq: 4 });
    expect(target()).toMatchObject({ parentKey: "0.0" });
    send({ source: "skeleton-host", type: "drag-end" });
  });

  it("moves the nearest movable node by dragging on the canvas, without selecting (T3.3)", () => {
    const { sent, send, flush } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    const box = (y: number, h: number) => () => ({ x: 0, y, left: 0, top: y, right: 100, bottom: y + h, width: 100, height: h, toJSON: () => ({}) }) as DOMRect;
    ($("#root-div") as HTMLElement).getBoundingClientRect = box(0, 100);
    ($(".dialog") as HTMLElement).getBoundingClientRect = box(0, 40);
    ($("#trigger") as HTMLElement).getBoundingClientRect = box(10, 20);
    document.querySelectorAll<HTMLElement>(".row").forEach((el, i) => (el.getBoundingClientRect = box(50 + i * 20, 20)));
    const at = { el: $("#trigger") };
    document.elementFromPoint = () => at.el;
    const mouse = (type: string, el: Element, x: number, y: number, buttons = 1) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));

    // Pressing on the trigger (wrapped by the locked Dialog) grabs the Dialog, the nearest movable node.
    mouse("pointerdown", $("#trigger"), 50, 20);
    mouse("pointermove", $("#trigger"), 51, 21); // under the threshold: still a click
    at.el = document.querySelectorAll(".row")[2] as Element;
    mouse("pointermove", at.el, 50, 85);
    flush();
    expect(document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML).toContain("Move 🔒 Dialog into div #ui_root0");
    const before = sent.length;
    mouse("pointerup", at.el, 50, 85, 0);
    mouse("click", at.el, 50, 85, 0);
    // Rows sit at y 50–110; below the last row's middle, with the Dialog taken out: index 1.
    expect(sent.slice(before)).toEqual([{ source: "skeleton-overlay", type: "move", key: "0.0", target: { parentKey: "0", index: 1 } }]);
    flush();
    expect(document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML).not.toContain("data-drop-indicator");
  });

  it("moves the selected node by its label, even where its children cover it (T5 gate)", () => {
    const { sent, send, flush } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    const box = (y: number, h: number) => () => ({ x: 0, y, left: 0, top: y, right: 100, bottom: y + h, width: 100, height: h, toJSON: () => ({}) }) as DOMRect;
    ($("#root-div") as HTMLElement).getBoundingClientRect = box(0, 100);
    ($(".dialog") as HTMLElement).getBoundingClientRect = box(20, 40);
    ($("#trigger") as HTMLElement).getBoundingClientRect = box(30, 20);
    document.querySelectorAll<HTMLElement>(".row").forEach((el, i) => (el.getBoundingClientRect = box(60 + i * 10, 10)));
    send({ source: "skeleton-host", type: "select", key: "0.0" });
    flush();
    const shadow = document.querySelector("skeleton-overlay")?.shadowRoot as ShadowRoot;
    const grip = shadow.querySelector("[data-grab]") as HTMLElement;
    expect(grip.getAttribute("data-grab")).toBe("0.0");
    expect(grip.textContent).toBe("⠿ 🔒 Dialog");
    const at = { el: $(".row") as Element };
    document.elementFromPoint = () => at.el;
    const mouse = (type: string, el: Element, x: number, y: number, buttons = 1) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons }));
    // A drag from the grip moves the Dialog, not what's under the pointer.
    mouse("pointerdown", grip, 5, 10);
    mouse("pointermove", at.el, 50, 60);
    mouse("pointermove", at.el, 50, 95);
    const before = sent.length;
    mouse("pointerup", at.el, 50, 95, 0);
    expect(sent.slice(before)).toEqual([{ source: "skeleton-overlay", type: "move", key: "0.0", target: { parentKey: "0", index: 1 } }]);
    // Hit tests look through the drawing layer: a drop aimed where the grip is drawn
    // still finds the app's element under it.
    const layer = document.querySelector("skeleton-overlay") as Element;
    document.elementFromPoint = () => layer;
    document.elementsFromPoint = () => [layer, $("#trigger"), $("#root-div")];
    send({ source: "skeleton-host", type: "drag", x: 5, y: 35, moving: null, seq: 7 });
    expect(sent.at(-1)).toMatchObject({ type: "drop-target", seq: 7, target: { parentKey: "0" } });
    // Nodes that can't move have no grip.
    send({ source: "skeleton-host", type: "select", key: "0.0.0" });
    flush();
    expect(shadow.querySelector("[data-grab]")).toBeNull();
  });

  it("treats a press without movement as a click, and Escape cancels a move", () => {
    const { sent, send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    document.elementFromPoint = () => $("#trigger");
    const mouse = (type: string, x: number, y: number, buttons = 1) =>
      $("#trigger").dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
    const flushed = () => document.querySelector("skeleton-overlay")?.shadowRoot?.innerHTML ?? "";
    mouse("pointerdown", 10, 10);
    mouse("pointerup", 10, 10, 0);
    mouse("click", 10, 10, 0);
    expect(sent.at(-1)).toEqual({ source: "skeleton-overlay", type: "select", key: "0.0.0" });
    mouse("pointerdown", 10, 10);
    mouse("pointermove", 40, 40);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const escaped = sent.length;
    mouse("pointerup", 40, 40, 0);
    expect(sent.slice(escaped).some((m) => m.type === "move")).toBe(false);
    // Escape pressed in Skeleton's window arrives as the host's drag-end.
    mouse("pointerdown", 10, 10);
    mouse("pointermove", 40, 40);
    send({ source: "skeleton-host", type: "drag-end" });
    const before = sent.length;
    mouse("pointerup", 40, 40, 0);
    expect(sent.slice(before).some((m) => m.type === "move")).toBe(false);

    // A release the frame never saw: the next move without buttons ends the drag.
    mouse("pointerdown", 10, 10);
    mouse("pointermove", 40, 40);
    mouse("pointermove", 45, 45, 0);
    const after = sent.length;
    mouse("pointerup", 45, 45, 0);
    expect(sent.slice(after).some((m) => m.type === "move")).toBe(false);
    expect(flushed()).not.toContain("data-drop-indicator");
  });

  it("re-reports what's mapped when the DOM catches up with the tree", async () => {
    const { sent, send, flush } = setup();
    const next = "0000000000000b";
    // The tree for the next version arrives before the app has re-rendered.
    send({ source: "skeleton-host", type: "tree", file: F, version: next, nodes });
    const mapped = () => sent.filter((m) => m.type === "mapped").map((m) => (m.type === "mapped" ? m.boxes.map((b) => b.key) : []));
    expect(mapped().at(-1)).toEqual([]);
    await act(async () => root.render(<Page rows={["a", "b", "c"]} version={next} />));
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver
    flush();
    expect(mapped().at(-1)).toEqual(["0", "0.0", "0.0.0", "0.1", "0.1.0"]);
    const count = mapped().length;
    flush();
    expect(mapped()).toHaveLength(count);
  });

  it("forwards Skeleton's shortcuts to the host in select mode only", () => {
    const { sent, send } = setup();
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(press("Delete")).toBe(true);
    expect(press("z", { metaKey: true, shiftKey: true })).toBe(true);
    expect(press("a")).toBe(false);
    expect(press("z")).toBe(false);
    expect(sent.filter((m) => m.type === "key")).toEqual([
      { source: "skeleton-overlay", type: "key", key: "Delete", mod: false, shift: false },
      { source: "skeleton-overlay", type: "key", key: "z", mod: true, shift: true },
    ]);
    send({ source: "skeleton-host", type: "mode", mode: "interact" });
    expect(press("Backspace")).toBe(false);
    expect(sent.filter((m) => m.type === "key")).toHaveLength(2);
  });

  it("only accepts same-origin paths to navigate to", async () => {
    const { isHostMessage } = await import("../src/protocol.js");
    expect(isHostMessage({ source: "skeleton-host", type: "navigate", path: "/orders" })).toBe(true);
    expect(isHostMessage({ source: "skeleton-host", type: "navigate", path: "//evil.example" })).toBe(false);
    expect(isHostMessage({ source: "skeleton-host", type: "navigate", path: "https://evil.example" })).toBe(false);
  });

  it("toggles .dark on the previewed document", () => {
    const { send } = setup();
    send({ source: "skeleton-host", type: "theme", dark: true });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    send({ source: "skeleton-host", type: "theme", dark: false });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("draws note pins in select mode, and a click on one goes to the host, not the app (T5.1)", () => {
    const { sent, send, flush } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes });
    send({
      source: "skeleton-host",
      type: "pins",
      pins: [
        { key: "0.0.0", open: 2, total: 3, type: "question", replied: true },
        { key: "0.1.0", open: 0, total: 1, type: "build", replied: false },
      ],
    });
    flush();
    const shadow = document.querySelector("skeleton-overlay")?.shadowRoot as ShadowRoot;
    const pin = shadow.querySelector('[data-pin="0.0.0"]') as HTMLElement;
    expect(pin.textContent).toBe("2\u2009↩");
    expect(pin.title).toBe("2 open of 3 notes · agent replied");
    expect(shadow.querySelector('[data-pin="0.1.0"]')?.textContent).toBe("✓");
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true }));
    expect(sent.at(-1)).toEqual({ source: "skeleton-overlay", type: "pin", key: "0.0.0" });
    expect(sent.some((m) => m.type === "select")).toBe(false);
    send({ source: "skeleton-host", type: "mode", mode: "interact" });
    flush();
    expect(shadow.querySelector("[data-pin]")).toBeNull();
    send({ source: "skeleton-host", type: "mode", mode: "select" });
    send({ source: "skeleton-host", type: "pins", pins: [] });
    flush();
    expect(shadow.querySelector("[data-pin]")).toBeNull();
  });

  it("ignores messages that don't come from the host", () => {
    const { sent, send } = setup();
    send({ source: "skeleton-host", type: "tree", file: F, version: V, nodes }, window);
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
