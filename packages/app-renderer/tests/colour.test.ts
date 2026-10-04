import { describe, expect, it } from "vitest";
import { alphaFor, alphaOf, COLOUR_GROUP, hexToOklch, hexToRgb, hslToRgb, hsvToRgb, opacityOf, rgbToHex, rgbToHsl, rgbToHsv } from "../src/colour.js";

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

  it("converts between hex, RGB, HSL and HSV", () => {
    expect(hexToRgb("#3366cc")).toEqual({ r: 51, g: 102, b: 204 });
    expect(hexToRgb("36c")).toEqual({ r: 51, g: 102, b: 204 });
    expect(hexToRgb("blue")).toBeNull();
    expect(rgbToHex({ r: 51, g: 102, b: 204 })).toBe("#3366cc");
    expect(rgbToHex({ r: 300, g: -4, b: 127.6 })).toBe("#ff0080");
    const rounded = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    expect(rounded(rgbToHsl({ r: 255, g: 0, b: 0 }))).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToRgb(220, 60, 50)).toEqual({ r: 51, g: 102, b: 204 });
    expect(rounded(rgbToHsv({ r: 51, g: 102, b: 204 }))).toEqual({ h: 220, s: 75, v: 80 });
    expect(hsvToRgb(220, 75, 80)).toEqual({ r: 51, g: 102, b: 204 });
    // Every hex survives a round trip through each model.
    for (const hex of ["#000000", "#ffffff", "#123456", "#fedcba", "#808080"]) {
      const rgb = hexToRgb(hex) as { r: number; g: number; b: number };
      const hsl = rgbToHsl(rgb);
      const hsv = rgbToHsv(rgb);
      expect(rgbToHex(hslToRgb(hsl.h, hsl.s, hsl.l))).toBe(hex);
      expect(rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v))).toBe(hex);
    }
  });

  it("reads and writes opacity as the alpha part", () => {
    expect(opacityOf(" / 10%")).toBe(10);
    expect(opacityOf(" / 0.4")).toBe(40);
    expect(opacityOf("")).toBe(100);
    expect(alphaFor(100)).toBe("");
    expect(alphaFor(39.6)).toBe(" / 40%");
  });
});
