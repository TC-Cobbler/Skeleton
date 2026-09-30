import { describe, expect, it } from "vitest";
import { alphaOf, COLOUR_GROUP, hexToOklch } from "../src/colour.js";

describe("colour", () => {
  it("converts hex to oklch", () => {
    expect(hexToOklch("#ffffff")).toBe("oklch(1 0 0)");
    expect(hexToOklch("#000000")).toBe("oklch(0 0 0)");
    // sRGB red is oklch(0.628 0.258 29.2).
    expect(hexToOklch("#ff0000")).toBe("oklch(0.628 0.258 29.2)");
    expect(hexToOklch("#ff0000", " / 50%")).toBe("oklch(0.628 0.258 29.2 / 50%)");
    expect(() => hexToOklch("red")).toThrow();
  });

  it("reads the alpha of a colour", () => {
    expect(alphaOf("oklch(1 0 0 / 10%)")).toBe(" / 10%");
    expect(alphaOf("oklch(0.5 0 0)")).toBe("");
  });

  it("groups colour utilities without catching sizes or widths", () => {
    const text = new RegExp(COLOUR_GROUP["text"] as string);
    expect(["text-primary", "text-muted-foreground", "text-[#fff]", "text-primary/80"].every((c) => text.test(c))).toBe(true);
    expect(["text-sm", "text-2xl", "text-center", "text-[14px]"].some((c) => text.test(c))).toBe(false);
    const border = new RegExp(COLOUR_GROUP["border"] as string);
    expect(border.test("border-input")).toBe(true);
    expect(["border", "border-2", "border-t", "border-b-2", "border-dashed", "border-[3px]"].some((c) => border.test(c))).toBe(false);
  });
});
