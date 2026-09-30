import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CalcError,
  dependentsOf,
  evaluate,
  formatQuantity,
  readTheme,
  readTokens,
  referencedTokens,
  setTokens,
  substituteVars,
  tryEvaluate,
} from "../src/index.js";

// The scaffold's globals.css: the full v1 token set (PRD §10.1).
const css = readFileSync(fileURLToPath(new URL("../../templates/project/src/styles/globals.css", import.meta.url)), "utf8");
const defaults = readTokens(css);

const lookup = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("evaluate", () => {
  it("does calc arithmetic over lengths and numbers, with var()", () => {
    const vars = lookup({ "--radius": "0.625rem", "--base": "1rem", "--ratio": "1.2" });
    expect(formatQuantity(evaluate("calc(var(--radius) * 0.8)", vars))).toBe("0.5rem");
    expect(formatQuantity(evaluate("calc(var(--base) / (var(--ratio) * var(--ratio)))", vars))).toBe("0.6944rem");
    expect(formatQuantity(evaluate("calc(2px + 3px * 2)", vars))).toBe("8px");
    expect(formatQuantity(evaluate("-1.5em", vars))).toBe("-1.5em");
    expect(formatQuantity(evaluate("var(--radius)", vars))).toBe("0.625rem");
  });

  it("refuses what it can't reduce to one quantity", () => {
    const vars = lookup({ "--radius": "0.625rem", "--self": "var(--self)" });
    expect(() => evaluate("calc(var(--radius) - 6px)", vars)).toThrow(CalcError);
    expect(() => evaluate("oklch(0.5 0 0)", vars)).toThrow(CalcError);
    expect(() => evaluate("var(--missing)", vars)).toThrow(/not defined/);
    expect(() => evaluate("var(--self)", vars)).toThrow(/itself/);
    expect(() => evaluate("1rem * 2rem", vars)).toThrow(/multiply/);
    expect(tryEvaluate("ui-sans-serif, system-ui", vars)).toBeNull();
  });

  it("substitutes references, keeping what it can't reduce", () => {
    const vars = lookup({ "--radius": "0.625rem", "--r2": "calc(var(--radius) * 2)" });
    expect(substituteVars("calc(var(--radius) - 6px)", vars)).toBe("calc(0.625rem - 6px)");
    expect(substituteVars("calc(var(--r2) + 1px)", vars)).toBe("calc(1.25rem + 1px)");
    expect(referencedTokens("calc(var(--a) * var(--b) + var(--a))")).toEqual(["--a", "--b"]);
  });
});

describe("readTheme", () => {
  const theme = readTheme(css, defaults);
  const token = (name: string) => theme.tokens.find((t) => t.name === name);

  it("lists every v1 token once, without Tailwind plumbing", () => {
    const names = theme.tokens.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["--radius", "--radius-button", "--spacing", "--type-base", "--text-4xl", "--font-sans", "--primary", "--border-width"]) {
      expect(names).toContain(name);
    }
    expect(names.some((n) => n.startsWith("--color-"))).toBe(false);
    expect(names).not.toContain("--default-border-width");
  });

  it("pairs light and dark colour values", () => {
    expect(token("--primary")).toMatchObject({ group: "colour", block: "light", value: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" });
    expect(token("--radius")?.dark).toBeNull();
  });

  it("shows a derived token's formula and what it comes to", () => {
    expect(token("--radius-button")).toMatchObject({
      group: "radius",
      block: "theme-inline",
      value: "calc(var(--radius) * 0.8)",
      references: ["--radius"],
      resolved: "0.5rem",
      defaultFormula: "calc(var(--radius) * 0.8)",
    });
    expect(token("--text-lg")).toMatchObject({ group: "type", references: ["--type-base", "--type-ratio"], resolved: "1.2rem" });
    // Mixed units stay unresolved.
    expect(token("--radius-xs")?.resolved).toBeNull();
    expect(token("--radius")).toMatchObject({ references: [], resolved: null, defaultFormula: null });
  });

  it("marks a detached token by its default formula", () => {
    const detached = readTheme(setTokens(css, [{ name: "--radius-card", value: "1rem", mode: null }]), defaults);
    expect(detached.tokens.find((t) => t.name === "--radius-card")).toMatchObject({
      value: "1rem",
      references: [],
      defaultFormula: "calc(var(--radius) * 1.6)",
    });
  });
});

describe("dependentsOf", () => {
  it("follows derivations transitively, plumbing included", () => {
    const raw = readTokens(css);
    const radius = dependentsOf(raw, "--radius");
    expect(radius).toEqual(expect.arrayContaining(["--radius-button", "--radius-card", "--radius-lg", "--radius-xs"]));
    expect(radius).not.toContain("--radius");
    expect(dependentsOf(raw, "--primary")).toEqual(["--color-primary"]);
    expect(dependentsOf(raw, "--border-width")).toEqual(["--default-border-width"]);
    expect(dependentsOf(raw, "--type-ratio")).toContain("--text-4xl");
  });
});

describe("setTokens", () => {
  const changed = (a: string, b: string) => {
    const al = a.split("\n");
    const bl = b.split("\n");
    expect(bl.length).toBe(al.length);
    return bl.filter((line, i) => line !== al[i]);
  };

  it("writes the light value in the token's own block", () => {
    expect(changed(css, setTokens(css, [{ name: "--primary", value: "oklch(0.5 0.2 250)", mode: "light" }]))).toEqual([
      "  --primary: oklch(0.5 0.2 250);",
    ]);
    const out = setTokens(css, [{ name: "--radius-button", value: "calc(var(--radius) * 1.2)", mode: null }]);
    expect(changed(css, out)).toEqual(["  --radius-button: calc(var(--radius) * 1.2);"]);
  });

  it("writes the dark value in .dark only", () => {
    const out = setTokens(css, [{ name: "--primary", value: "oklch(0.7 0.1 30)", mode: "dark" }]);
    expect(changed(css, out)).toEqual(["  --primary: oklch(0.7 0.1 30);"]);
    expect(readTheme(out).tokens.find((t) => t.name === "--primary")).toMatchObject({ value: "oklch(0.205 0 0)", dark: "oklch(0.7 0.1 30)" });
  });

  it("refuses unknown tokens and dark values a token doesn't have", () => {
    expect(() => setTokens(css, [{ name: "--nope", value: "1px", mode: null }])).toThrow(/not found/);
    expect(() => setTokens(css, [{ name: "--radius", value: "1rem", mode: "dark" }])).toThrow(/no dark value/);
  });
});
