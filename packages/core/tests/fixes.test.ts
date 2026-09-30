import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describeViolations, parseColour, colourDistance, promoteViolation, readPalette, readTokens, type ViolationDetail } from "../src/index.js";

const css = readFileSync(fileURLToPath(new URL("../../templates/project/src/styles/globals.css", import.meta.url)), "utf8");
const palette = readPalette(`@theme default {\n  --color-red-500: oklch(63.7% 0.237 25.331);\n  --color-black: #000;\n}\n`);

const page = `import { Button } from "@/components/ui/button";
import { Stack } from "@/components/layout";
import { cn } from "@/lib/utils";

export default function Page({ x }: { x: string }) {
  return (
    <Stack data-ui-id="ui_stk01" className="gap-[13px] p-4">
      <Button data-ui-id="ui_btn01" className="rounded-[14px] hover:bg-[#ff0000]">A</Button>
      <p data-ui-id="ui_txt01" className="text-[17px] text-red-500 border-[3px] -mt-[6px]">T</p>
      <div data-ui-id="ui_sty01" style={{ color: "red" }} />
      <p data-ui-id="ui_cn001" className={cn("mt-[5px]", x)}>logic</p>
      <div data-ui-id="ui_oth01" className="grid-cols-[1fr_auto]" />
    </Stack>
  );
}
`;

describe("describeViolations (T4.6)", () => {
  const details = describeViolations(page, "src/pages/Page.tsx", { css, palette });
  const find = (value: string) => details.find((d) => d.value === value) as ViolationDetail;

  it("names the element and property of every violation", () => {
    expect(details.map((d) => [d.value.startsWith("style") ? "style" : d.value, d.element?.id, d.property])).toEqual([
      ["gap-[13px]", "ui_stk01", "spacing"],
      ["rounded-[14px]", "ui_btn01", "radius"],
      ["hover:bg-[#ff0000]", "ui_btn01", "colour"],
      ["text-[17px]", "ui_txt01", "font-size"],
      ["text-red-500", "ui_txt01", "colour"],
      ["border-[3px]", "ui_txt01", "border-width"],
      ["-mt-[6px]", "ui_txt01", "spacing"],
      ["style", "ui_sty01", "style"],
      ["mt-[5px]", "ui_cn001", "spacing"],
      ["grid-cols-[1fr_auto]", "ui_oth01", "other"],
    ]);
  });

  it("finds the nearest token, keeping variants", () => {
    expect(find("rounded-[14px]").nearest).toEqual({ utility: "rounded-xl", token: "--radius-xl", value: "14px" });
    expect(find("gap-[13px]").nearest).toEqual({ utility: "gap-3.5", token: "--spacing", value: "14px" });
    expect(find("-mt-[6px]").nearest).toEqual({ utility: "-mt-1.5", token: "--spacing", value: "-6px" });
    expect(find("text-[17px]").nearest).toMatchObject({ utility: "text-base", token: "--text-base" });
    expect(find("hover:bg-[#ff0000]").nearest).toMatchObject({ utility: "hover:bg-destructive", token: "--destructive" });
    expect(find("text-red-500").nearest).toMatchObject({ utility: "text-destructive", token: "--destructive" });
    expect(find("border-[3px]").nearest).toEqual({ utility: "border", token: "--border-width", value: "1px" });
    expect(find("grid-cols-[1fr_auto]").nearest).toBeNull();
  });

  it("marks only literal classes on editable, ID'd elements as fixable", () => {
    expect(details.filter((d) => d.editable).map((d) => d.value)).toEqual([
      "gap-[13px]",
      "rounded-[14px]",
      "hover:bg-[#ff0000]",
      "text-[17px]",
      "text-red-500",
      "border-[3px]",
      "-mt-[6px]",
      "grid-cols-[1fr_auto]",
    ]);
  });

  it("says what each can be promoted to", () => {
    expect(find("rounded-[14px]").promote).toBe("radius");
    expect(find("gap-[13px]").promote).toBe("spacing");
    expect(find("-mt-[6px]").promote).toBeNull();
    expect(find("text-[17px]").promote).toBe("text");
    expect(find("text-red-500").promote).toBe("colour");
    expect(find("border-[3px]").promote).toBeNull();
    expect(details.find((d) => d.kind === "inline-style")?.promote).toBeNull();
  });

  it("returns nothing for a clean file", () => {
    expect(describeViolations(`export default function P() {\n  return <div className="p-4" />;\n}\n`, "a.tsx", { css, palette })).toEqual([]);
  });
});

describe("promoteViolation (T4.6)", () => {
  const details = describeViolations(page, "src/pages/Page.tsx", { css, palette });
  const find = (value: string) => details.find((d) => d.value === value) as ViolationDetail;
  const added = (before: string, after: string) => after.split("\n").filter((l) => !before.split("\n").includes(l));

  it("creates a component radius token and returns its class", () => {
    const out = promoteViolation(css, find("rounded-[14px]"), "hero", { palette });
    expect(out.utility).toBe("rounded-hero");
    expect(added(css, out.css)).toEqual(["  --radius-hero: 0.875rem;"]);
    expect(readTokens(out.css).find((t) => t.name === "--radius-hero")?.block).toBe("theme-inline");
  });

  it("creates a colour with light and dark values and its Tailwind name, keeping variants", () => {
    const out = promoteViolation(css, find("hover:bg-[#ff0000]"), "brand", { palette });
    expect(out.utility).toBe("hover:bg-brand");
    const tokens = readTokens(out.css).filter((t) => t.name.endsWith("brand"));
    expect(tokens.map((t) => [t.name, t.block, t.value])).toEqual([
      ["--brand", "light", "#ff0000"],
      ["--brand", "dark", "#ff0000"],
      ["--color-brand", "theme-inline", "var(--brand)"],
    ]);
  });

  it("creates spacing and text tokens", () => {
    expect(promoteViolation(css, find("gap-[13px]"), "tight", { palette })).toMatchObject({ utility: "gap-tight" });
    expect(readTokens(promoteViolation(css, find("gap-[13px]"), "tight", { palette }).css).find((t) => t.name === "--spacing-tight")).toMatchObject({ block: "theme", value: "0.8125rem" });
    expect(promoteViolation(css, find("text-[17px]"), "lead", { palette }).utility).toBe("text-lead");
  });

  it("refuses taken and bad names, and what can't be promoted", () => {
    expect(() => promoteViolation(css, find("rounded-[14px]"), "button", { palette })).toThrow(/already exists/);
    expect(() => promoteViolation(css, find("hover:bg-[#ff0000]"), "primary", { palette })).toThrow(/already exists/);
    expect(() => promoteViolation(css, find("rounded-[14px]"), "Hero!", { palette })).toThrow(/can't name/);
    expect(() => promoteViolation(css, find("border-[3px]"), "thick", { palette })).toThrow(/can't be promoted/);
  });
});

describe("colours", () => {
  it("parses hex, rgb and oklch to comparable points", () => {
    const red = parseColour("#f00");
    expect(red).not.toBeNull();
    expect(colourDistance(red!, parseColour("rgb(255 0 0)")!)).toBeLessThan(1e-6);
    expect(colourDistance(red!, parseColour("oklch(0.628 0.2577 29.23)")!)).toBeLessThan(0.002);
    expect(colourDistance(parseColour("white")!, parseColour("oklch(100% 0 0)")!)).toBeLessThan(1e-4);
    expect(parseColour("var(--x)")).toBeNull();
  });
});
