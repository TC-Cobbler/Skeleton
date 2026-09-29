import { describe, expect, it } from "vitest";
import { analyseTakeBack, findViolations, isCleanTakeBack, writeTokens } from "../src/index.js";
import { readFixtureSnapshot } from "./helpers.js";

const before = readFixtureSnapshot("base");
const HOME = "src/pages/HomePage.tsx";
const CSS = "src/styles/globals.css";

describe("analyseTakeBack", () => {
  it("reports nothing for an untouched project", () => {
    const report = analyseTakeBack(before, before);
    expect(report).toEqual({
      orphanedIds: [],
      duplicateIds: [],
      unIdedEditable: [],
      newViolations: [],
      newLockedBlocks: [],
      tokenTampering: null,
      parseErrors: [],
    });
    expect(isCleanTakeBack(report)).toBe(true);
  });

  it("does not flag shadcn internals (arbitrary variants in components/ui)", () => {
    expect(analyseTakeBack({}, before).newViolations).toEqual([]);
  });

  it("catches a sloppy agent pass", () => {
    const home = (before[HOME] as string)
      // strip an ID
      .replace(` data-ui-id="ui_exp0r"`, "")
      // duplicate an ID
      .replace(`<CardTitle data-ui-id="ui_crdt1">`, `<CardTitle data-ui-id="ui_crdh1">`)
      // add an un-ID'd div with an arbitrary value, a palette colour and an inline style
      .replace(
        `<Card data-ui-id="ui_crd01">`,
        `<div className="p-[13px] bg-red-500 max-md:hover:rounded-[4px]" style={{ color: "#f00" }}>x</div>\n      <Card data-ui-id="ui_crd01">`,
      )
      // data-bearing rows: a new locked .map block
      .replace(
        `<TableRow data-ui-id="ui_tbr01">`,
        `{orders.map((o) => <TableRow key={o.id} data-ui-id="ui_row99"><TableCell data-ui-id="ui_cel99">{o.id}</TableCell></TableRow>)}\n              <TableRow data-ui-id="ui_tbr01">`,
      );
    const css = writeTokens(before[CSS] as string, [{ name: "--radius-card", value: "1rem" }]) + "\n.oops { color: red; }\n";
    const report = analyseTakeBack(before, { ...before, [HOME]: home, [CSS]: css });

    expect(report.orphanedIds.map((o) => o.id).sort()).toEqual(["ui_crdt1", "ui_exp0r"]);
    expect(report.duplicateIds.map((d) => [d.id, d.occurrences.length, d.isNew])).toEqual([["ui_crdh1", 2, true]]);
    // The div is locked by its style object, so only the stripped Button counts.
    expect(report.unIdedEditable.map((n) => n.element)).toEqual(["Button"]);
    expect(report.newViolations.map((v) => [v.kind, v.value])).toEqual([
      ["arbitrary-value", "p-[13px]"],
      ["hard-coded-colour", "bg-red-500"],
      ["arbitrary-value", "max-md:hover:rounded-[4px]"],
      ["inline-style", `style={{ color: "#f00" }}`],
    ]);
    expect(report.newLockedBlocks.map((b) => [b.element, b.reason])).toEqual([
      ["div", "logic in style prop"],
      ["map", ".map() loop"],
    ]);
    expect(report.tokenTampering).toEqual({
      changes: [{ name: "--radius-card", block: "theme-inline", before: "calc(var(--radius) * 1.25)", after: "1rem" }],
      nonTokenChanges: true,
    });
    expect(isCleanTakeBack(report)).toBe(false);
  });

  it("reports only new violations and new locked blocks", () => {
    const withMap = (before[HOME] as string).replace(
      `<TableRow data-ui-id="ui_tbr01">`,
      `{orders.map((o) => <TableRow key={o.id} data-ui-id="ui_row99" />)}\n              <TableRow data-ui-id="ui_tbr01">`,
    );
    const pass1 = { ...before, [HOME]: withMap.replace(`className="gap-2"`, `className="gap-2 p-[3px]"`) };
    // Second pass reindents the existing block and adds nothing new.
    const pass2 = { ...pass1, [HOME]: (pass1[HOME] as string).replace("{orders.map((o) =>", "{orders.map((o) =>\n  ") };
    const report = analyseTakeBack(pass1, pass2);
    expect(report.newLockedBlocks).toEqual([]);
    expect(report.newViolations).toEqual([]);
  });

  it("reports token-only edits without flagging structure", () => {
    const css = writeTokens(before[CSS] as string, [{ name: "--primary", value: "oklch(0.5 0 0)", block: "dark" }]);
    expect(analyseTakeBack(before, { ...before, [CSS]: css }).tokenTampering?.nonTokenChanges).toBe(false);
  });

  it("reports files that no longer parse", () => {
    const report = analyseTakeBack(before, { ...before, [HOME]: "export default function (" });
    expect(report.parseErrors.map((e) => e.file)).toEqual([HOME]);
    expect(isCleanTakeBack(report)).toBe(false);
  });
});

describe("findViolations", () => {
  it("scans cn()/cva() strings and conditional classNames", () => {
    const src = `export default () => <div className={cn("p-4", on ? "text-blue-600" : "text-foreground", "w-[10px]")} />;`;
    expect(findViolations(src, "a.tsx").map((v) => v.value)).toEqual(["text-blue-600", "w-[10px]"]);
  });

  it("allows token classes, opacity modifiers and arbitrary variants", () => {
    const src = `export default () => <div className="bg-primary/90 text-muted-foreground rounded-card [&_tr]:border-b gap-4" />;`;
    expect(findViolations(src, "a.tsx")).toEqual([]);
  });
});
