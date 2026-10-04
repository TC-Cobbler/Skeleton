// @vitest-environment jsdom
// Tooltips show on hover and on keyboard focus (T8.5, spec §3).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Undo2 } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconButton, Tooltip } from "../src/Tooltip.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const tooltip = () => host.querySelector('[role="tooltip"]')?.textContent ?? null;
const fire = (el: Element, type: string, init: KeyboardEventInit & MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(type.startsWith("key") ? new KeyboardEvent(type, { bubbles: true, ...init }) : new MouseEvent(type, { bubbles: true, ...init }));
  });

describe("IconButton", () => {
  it("is named by its label, shows only its icon, and doesn't repeat the label as a description", () => {
    act(() => root.render(<IconButton label="Undo" icon={Undo2} onClick={() => undefined} />));
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Undo");
    expect(button.textContent).toBe("");
    // 1.5px on screen: Lucide draws on a 24-unit grid, so at 20px that's 1.5 × 24 / 20.
    const svg = button.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(Number(svg?.getAttribute("stroke-width"))).toBeCloseTo((1.5 * 24) / 20);
    expect(button.hasAttribute("aria-description")).toBe(false);
  });

  it("shows its label after a short hover, and hides it on leaving", () => {
    act(() => root.render(<IconButton label="Undo" icon={Undo2} />));
    const wrap = host.querySelector("[data-tooltip-anchor]") as HTMLElement;
    // React listens for mouseover/mouseout to make enter and leave.
    fire(wrap, "mouseover");
    expect(tooltip()).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(tooltip()).toBe("Undo");
    fire(wrap, "mouseout", { relatedTarget: document.body });
    expect(tooltip()).toBeNull();
  });

  it("shows its label at once on keyboard focus, and hides it on Escape", () => {
    act(() => root.render(<IconButton label="Redo" icon={Undo2} />));
    const button = host.querySelector("button") as HTMLButtonElement;
    // jsdom has no keyboard modality: count this focus as keyboard focus.
    vi.spyOn(button, "matches").mockImplementation((selector: string) => selector === ":focus-visible");
    act(() => button.focus());
    expect(tooltip()).toBe("Redo");
    fire(button, "keydown", { key: "Escape" });
    expect(tooltip()).toBeNull();
  });

  it("shows the hint instead of the label when there's more to say, and describes the button by it", () => {
    act(() => root.render(<IconButton label="Undo" hint="Undo Insert Badge (Ctrl+Z)" icon={Undo2} disabled />));
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-description")).toBe("Undo Insert Badge (Ctrl+Z)");
    fire(host.querySelector("[data-tooltip-anchor]") as HTMLElement, "mouseover");
    act(() => vi.advanceTimersByTime(500));
    expect(tooltip()).toBe("Undo Insert Badge (Ctrl+Z)");
  });
});

describe("Tooltip", () => {
  it("gives a button with words its hint, as tooltip and description", () => {
    act(() =>
      root.render(
        <Tooltip text="It's already first.">
          <button type="button" disabled>
            Move up
          </button>
        </Tooltip>,
      ),
    );
    expect(host.querySelector("button")?.getAttribute("aria-description")).toBe("It's already first.");
    fire(host.querySelector("[data-tooltip-anchor]") as HTMLElement, "mouseover");
    act(() => vi.advanceTimersByTime(500));
    expect(tooltip()).toBe("It's already first.");
  });
});
