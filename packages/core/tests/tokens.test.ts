import { describe, expect, it } from "vitest";
import { readTokens, writeTokens } from "../src/index.js";
import { readFixture } from "./helpers.js";

const css = readFixture("base/src/styles/globals.css");

/** Lines that differ between two same-length texts. */
function changedLines(a: string, b: string): string[] {
  const al = a.split("\n");
  const bl = b.split("\n");
  expect(bl.length).toBe(al.length);
  return bl.filter((line, i) => line !== al[i]);
}

describe("readTokens", () => {
  const tokens = readTokens(css);

  it("reads light, dark, @theme and @theme inline blocks", () => {
    const find = (name: string, block: string) => tokens.find((t) => t.name === name && t.block === block)?.value;
    expect(find("--primary", "light")).toBe("oklch(0.205 0 0)");
    expect(find("--primary", "dark")).toBe("oklch(0.922 0 0)");
    expect(find("--radius-card", "theme-inline")).toBe("calc(var(--radius) * 1.25)");
    expect(find("--spacing", "theme")).toBe("0.25rem");
  });
});

describe("writeTokens", () => {
  it("round-trips unchanged with no updates", () => {
    expect(writeTokens(css, [])).toBe(css);
  });

  it("changes only the targeted declaration", () => {
    const out = writeTokens(css, [{ name: "--radius-card", value: "calc(var(--radius) * 1.5)" }]);
    expect(changedLines(css, out)).toEqual(["  --radius-card: calc(var(--radius) * 1.5);"]);
  });

  it("targets light or dark explicitly for colours", () => {
    const out = writeTokens(css, [{ name: "--primary", value: "oklch(0.5 0.2 250)", block: "dark" }]);
    expect(changedLines(css, out)).toEqual(["  --primary: oklch(0.5 0.2 250);"]);
    expect(readTokens(out).find((t) => t.name === "--primary" && t.block === "light")?.value).toBe("oklch(0.205 0 0)");
  });

  it("refuses ambiguous names without a block", () => {
    expect(() => writeTokens(css, [{ name: "--primary", value: "red" }])).toThrow(/several blocks/);
  });

  it("refuses unknown tokens unless creating, and bad values", () => {
    expect(() => writeTokens(css, [{ name: "--radius-badge", value: "1rem" }])).toThrow(/not found/);
    expect(() => writeTokens(css, [{ name: "--radius", value: "1rem; color: red" }])).toThrow(/invalid value/);
    expect(() => writeTokens(css, [{ name: "radius", value: "1rem" }])).toThrow(/must start with --/);
  });

  it("creates a token after the last declaration of its block, leaving everything else", () => {
    const out = writeTokens(css, [{ name: "--radius-badge", value: "calc(var(--radius) * 2)", block: "theme-inline", create: true }]);
    const before = css.split("\n");
    const after = out.split("\n");
    expect(after.length).toBe(before.length + 1);
    const at = after.indexOf("  --radius-badge: calc(var(--radius) * 2);");
    expect(after[at - 1]).toBe("  --radius-input: calc(var(--radius) * 0.75);");
    expect([...after.slice(0, at), ...after.slice(at + 1)]).toEqual(before);
  });

  it("does not touch comments or non-token rules", () => {
    const withComments = css.replace(":root {", "/* light */\n:root {").replace("@layer base {", "/* base */\n@layer base {");
    const out = writeTokens(withComments, [{ name: "--spacing", value: "0.3rem" }]);
    expect(changedLines(withComments, out)).toEqual(["  --spacing: 0.3rem;"]);
  });
});
