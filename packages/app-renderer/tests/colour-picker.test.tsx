// @vitest-environment jsdom
// The colour picker: typed hex, RGB, HSL and opacity values become the colour it writes.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColourEditor, ColourSwatch } from "../src/ColourPicker.js";
import { copy } from "../src/copy.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const field = (label: string) => {
  const el = [...host.querySelectorAll("label")].find((l) => l.querySelector("span")?.textContent === label)?.querySelector("input");
  if (!el) throw new Error(`no field ${label}`);
  return el;
};
/** Types into a field the way a person does, then presses Enter. */
const enter = (input: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });

describe("ColourEditor", () => {
  it("writes a typed hex, short hex, RGB or HSL value, keeping the opacity", () => {
    const onCommit = vi.fn();
    act(() => root.render(<ColourEditor label="Main colour" value="#000000" onCommit={onCommit} />));
    enter(field(copy.colour.hex), "#3366cc");
    expect(onCommit).toHaveBeenLastCalledWith("#3366cc", 100);
    enter(field(copy.colour.hex), "f80");
    expect(onCommit).toHaveBeenLastCalledWith("#ff8800", 100);
    enter(field(copy.colour.red), "0");
    expect(onCommit).toHaveBeenLastCalledWith("#008800", 100);
    enter(field(copy.colour.hueShort), "240");
    expect(onCommit).toHaveBeenLastCalledWith("#000088", 100);
    enter(field(copy.colour.opacity), "40");
    expect(onCommit).toHaveBeenLastCalledWith("#000088", 40);
  });

  it("clamps numbers to their range and ignores what isn't a colour", () => {
    const onCommit = vi.fn();
    act(() => root.render(<ColourEditor label="Main colour" value="#000000" onCommit={onCommit} />));
    enter(field(copy.colour.green), "999");
    expect(onCommit).toHaveBeenLastCalledWith("#00ff00", 100);
    expect(field(copy.colour.green).value).toBe("255");
    onCommit.mockClear();
    enter(field(copy.colour.hex), "not a colour");
    expect(onCommit).not.toHaveBeenCalled();
    expect(field(copy.colour.hex).value).toBe("#00ff00");
  });

  it("has no opacity field for a colour on one element", () => {
    act(() => root.render(<ColourEditor label="Just this one" value="#000000" opacity={false} onCommit={() => undefined} />));
    expect(() => field(copy.colour.opacity)).toThrow();
  });
});

describe("ColourSwatch", () => {
  it("is a button named by its theme value that opens the picker", () => {
    act(() => root.render(<ColourSwatch label="Main colour, light mode" value="oklch(0.5 0.2 290)" onCommit={() => undefined} />));
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Main colour, light mode");
    expect(button.dataset["value"]).toBe("oklch(0.5 0.2 290)");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => button.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Main colour, light mode");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});
