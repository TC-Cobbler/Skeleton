import { describe, expect, it } from "vitest";
import { copy } from "../src/copy.js";
import { factorOf, handlesFor, planDrag, scopeOf, toPx, typeScale, type Drag, type GizmoData, type Handle, type Measured } from "../src/gizmos.js";
import type { GizmoToken } from "../src/protocol.js";

const token = (name: string, value: string, resolved: string | null = null, colour = false): GizmoToken => ({ name, value, resolved, colour });
const tokens: GizmoToken[] = [
  token("--radius", "0.625rem"),
  token("--radius-button", "calc(var(--radius) * 0.8)", "0.5rem"),
  token("--radius-card", "1rem"),
  token("--spacing", "0.25rem"),
  token("--type-base", "1rem"),
  token("--text-sm", "calc(var(--type-base) / var(--type-ratio))", "0.8333rem"),
  token("--text-base", "var(--type-base)", "1rem"),
  token("--text-lg", "calc(var(--type-base) * var(--type-ratio))", "1.2rem"),
  token("--border-width", "1px"),
  token("--primary", "oklch(0.205 0 0)", null, true),
];
const data: GizmoData = { tokens, spacingSteps: [0, 1, 2, 3, 4, 6, 8], classEdits: null };

function measured(over: Partial<Measured> = {}): Measured {
  return {
    rect: { x: 100, y: 100, width: 200, height: 80 },
    container: false,
    classes: [],
    radius: 8,
    flow: null,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    fontSize: 16,
    hasText: false,
    borderWidth: 0,
    gaps: [],
    rem: 16,
    ...over,
  };
}

const handle = (kind: Handle["kind"], part: Handle["part"] = null): Handle => ({ kind, part, rect: { x: 0, y: 0, width: 10, height: 10 } });
function plan(h: Handle, scope: "component" | "global" | "instance", m: Measured, d: GizmoData = data): Drag {
  const p = planDrag(h, scope, m, d);
  if ("unavailable" in p) throw new Error(p.unavailable);
  return p;
}

describe("gizmos (T4.3–T4.5)", () => {
  it("picks the scope from the modifiers", () => {
    expect(scopeOf({ shiftKey: false, altKey: false })).toBe("component");
    expect(scopeOf({ shiftKey: true, altKey: false })).toBe("global");
    expect(scopeOf({ shiftKey: true, altKey: true })).toBe("instance");
  });

  it("draws radius on anything, spacing on containers, a baseline on text, an edge on borders", () => {
    expect(handlesFor(measured()).map((h) => h.kind)).toEqual(["radius"]);
    const stack = measured({ container: true, flow: "column", gaps: [{ x: 100, y: 130, width: 200, height: 16 }], padding: { top: 16, right: 16, bottom: 16, left: 16 } });
    expect(handlesFor(stack).map((h) => `${h.kind}${h.part ?? ""}`)).toEqual(["gap0", "paddingtop", "paddingbottom", "paddingleft", "paddingright", "radius"]);
    // A Button is inline-flex with padding, but not a layout container.
    expect(handlesFor(measured({ flow: "row", hasText: true, borderWidth: 1 })).map((h) => h.kind)).toEqual(["type", "border", "radius"]);
    expect(handlesFor(measured({ rect: { x: 0, y: 0, width: 4, height: 4 } }))).toEqual([]);
  });

  describe("radius (PRD F3)", () => {
    const button = measured({ classes: ["rounded-button", "bg-primary"], radius: 8 });

    it("plain drag changes the component token's factor, so it stays derived", () => {
      const d = plan(handle("radius"), "component", button);
      expect(d.token).toBe("--radius-button");
      const v = d.valueAt(8, 8); // diagonal: +8px
      expect(v).toBe(16);
      expect(d.at(v).commit).toEqual({ kind: "token", name: "--radius-button", value: "calc(var(--radius) * 1.6)" });
      expect(d.at(v).css).toBe(".rounded-button{border-radius:16px!important}");
    });

    it("plain drag on a detached token writes a length", () => {
      const card = measured({ classes: ["rounded-card"], radius: 16 });
      expect(plan(handle("radius"), "component", card).at(20).commit).toEqual({ kind: "token", name: "--radius-card", value: "1.25rem" });
    });

    it("Shift sets the base so this element lands where dragged; derived tokens follow", () => {
      const d = plan(handle("radius"), "global", button);
      expect(d.token).toBe("--radius");
      expect(d.at(12)).toMatchObject({ commit: { kind: "token", name: "--radius", value: "0.9375rem" }, css: ":root{--radius:0.9375rem!important}" });
    });

    it("Alt writes an arbitrary radius on this element only", () => {
      const d = plan(handle("radius"), "instance", button);
      expect(d.token).toBeNull();
      expect(d.at(14)).toMatchObject({ commit: { kind: "class", add: "rounded-[14px]" }, css: "[data-skeleton-gizmo]{border-radius:14px!important}" });
      const remove = new RegExp((d.at(14).commit as { remove: string }).remove);
      expect(["rounded-button", "rounded-tl-lg", "rounded-[3px]", "rounded"].every((c) => remove.test(c))).toBe(true);
      expect(remove.test("bg-primary")).toBe(false);
    });

    it("says why a scope isn't available", () => {
      expect(planDrag(handle("radius"), "component", measured({ classes: ["rounded-full"] }), data)).toEqual({ unavailable: copy.gizmos.noRadiusToken });
      expect(planDrag(handle("radius"), "instance", button, { ...data, classEdits: "it's a locked block" })).toEqual({ unavailable: "it's a locked block" });
    });
  });

  describe("spacing", () => {
    const stack = measured({ flow: "column", classes: ["flex", "flex-col", "gap-4", "p-4"], gap: 16, padding: { top: 16, right: 16, bottom: 16, left: 16 } });

    it("plain drag steps the gap through the spacing scale", () => {
      const d = plan(handle("gap", 0), "component", stack);
      expect(d.valueAt(0, 9)).toBe(25); // along the column
      expect(d.at(25)).toMatchObject({ commit: { kind: "class", add: "gap-6" }, text: "gap-6", css: "[data-skeleton-gizmo]{gap:24px!important}" });
    });

    it("Shift scales --spacing so this gap lands where dragged; Alt writes px", () => {
      expect(plan(handle("gap", 0), "global", stack).at(24).commit).toEqual({ kind: "token", name: "--spacing", value: "0.375rem" });
      expect(plan(handle("gap", 0), "instance", stack).at(13).commit).toMatchObject({ kind: "class", add: "gap-[13px]" });
    });

    it("padding edges pull inwards, and edit the axis class when there is one", () => {
      const top = plan(handle("padding", "top"), "component", stack);
      expect(top.valueAt(0, 8)).toBe(24);
      expect(top.at(24).commit).toMatchObject({ add: "p-6" });
      const right = plan(handle("padding", "right"), "component", measured({ ...stack, classes: ["px-4", "py-2"] }));
      expect(right.valueAt(-8, 0)).toBe(24);
      expect(right.at(24)).toMatchObject({ commit: { add: "px-6" }, css: "[data-skeleton-gizmo]{padding-inline:24px!important}" });
    });

    it("Shift needs a scale step to scale from", () => {
      expect(planDrag(handle("gap", 0), "global", measured({ flow: "row", gap: 13, classes: ["gap-[13px]"] }), data)).toEqual({ unavailable: copy.gizmos.notSpacingStep("gap") });
    });
  });

  describe("type", () => {
    const text = measured({ hasText: true, fontSize: 16, classes: ["text-base"] });

    it("plain drag steps through the type scale, one step per 12px up", () => {
      const d = plan(handle("type"), "component", text);
      expect(d.valueAt(0, -12)).toBe(19.2);
      expect(d.at(19.2).commit).toEqual({ kind: "class", remove: expect.any(String), add: "text-lg" });
      expect(d.valueAt(0, 30)).toBe(13.33);
      const remove = new RegExp((d.at(19.2).commit as { remove: string }).remove);
      expect(remove.test("text-sm")).toBe(true);
      expect(remove.test("text-primary")).toBe(false);
    });

    it("Shift scales --type-base; Alt writes px", () => {
      expect(plan(handle("type"), "global", text).at(20).commit).toEqual({ kind: "token", name: "--type-base", value: "1.25rem" });
      expect(plan(handle("type"), "instance", text).at(17).commit).toMatchObject({ add: "text-[17px]" });
    });
  });

  describe("border width", () => {
    it("sets --border-width for plain and Shift, px for Alt, and only for the default width", () => {
      const bordered = measured({ borderWidth: 1, classes: ["border"] });
      expect(plan(handle("border"), "component", bordered).at(2).commit).toEqual({ kind: "token", name: "--border-width", value: "2px" });
      expect(plan(handle("border"), "global", bordered).at(3).css).toBe(":root{--border-width:3px!important}");
      const remove = new RegExp((plan(handle("border"), "instance", bordered).at(3).commit as { remove: string }).remove);
      expect(["border", "border-2", "border-[1px]"].every((c) => remove.test(c))).toBe(true);
      expect(["border-input", "border-t", "border-[#fff]"].some((c) => remove.test(c))).toBe(false);
      expect(planDrag(handle("border"), "component", measured({ borderWidth: 2, classes: ["border-2"] }), data)).toEqual({ unavailable: expect.any(String) });
    });
  });

  it("reads factors, lengths and the type scale", () => {
    expect(factorOf("calc(var(--radius) * 0.8)")).toBe(0.8);
    expect(factorOf("var(--radius)")).toBe(1);
    expect(factorOf("calc(var(--radius) - 4px)")).toBeNull();
    expect(toPx("0.5rem", 16)).toBe(8);
    expect(toPx("3px", 16)).toBe(3);
    expect(toPx("calc(1rem)", 16)).toBeNull();
    expect(typeScale(tokens, 16).map((s) => s.step)).toEqual(["sm", "base", "lg"]);
  });
});
