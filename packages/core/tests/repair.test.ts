import { describe, expect, it } from "vitest";
import { buildIdIndex, collectIds, diffSources, repairIds, UI_ID_PATTERN } from "../src/index.js";
import { assertSurgical, linesOf, readFixtureSnapshot } from "./helpers.js";

const base = readFixtureSnapshot("base");
const HOME = "src/pages/HomePage.tsx";
const home = base[HOME] as string;
const seq = () => {
  let i = 0;
  return () => ((i++ * 11) % 36) / 36;
};

describe("repairIds (T5.6)", () => {
  it("changes nothing in a clean project", () => {
    expect(repairIds(base, base)).toEqual({ files: {}, repairs: [] });
  });

  it("re-mints the copy of a duplicated ID, not the original", () => {
    // The agent copied the New order Button, ID and all, and put the copy first.
    const after = home.replace(
      '<Button data-ui-id="ui_new0r">New order</Button>',
      '<Button data-ui-id="ui_new0r">Import</Button>\n        <Button data-ui-id="ui_new0r">New order</Button>',
    );
    const { files, repairs } = repairIds(base, { ...base, [HOME]: after }, { random: seq() });
    const fixed = files[HOME] as string;
    expect(repairs).toHaveLength(1);
    // The unchanged original keeps its ID, though the copy is now on its old line.
    expect(repairs[0]).toMatchObject({ kind: "reminted", file: HOME, element: "Button", was: "ui_new0r", line: 20 });
    const id = repairs[0]?.id as string;
    expect(id).toMatch(UI_ID_PATTERN);
    expect(fixed).toContain(`<Button data-ui-id="${id}">Import</Button>`);
    expect(fixed).toContain('<Button data-ui-id="ui_new0r">New order</Button>');
    expect(buildIdIndex({ [HOME]: fixed }).duplicates).toEqual([]);
    assertSurgical(after, { source: fixed, diff: diffSources(after, fixed) }, [linesOf(after, ">Import<")]);
  });

  it("keeps the occurrence in the file the ID was in", () => {
    const other = "src/components/Extra.tsx";
    const extra = 'export function Extra() {\n  return <div data-ui-id="ui_tbl01">x</div>;\n}\n';
    const { files, repairs } = repairIds(base, { ...base, [other]: extra }, { random: seq() });
    expect(Object.keys(files)).toEqual([other]);
    expect(repairs.map((r) => [r.file, r.was])).toEqual([[other, "ui_tbl01"]]);
  });

  it("gives un-ID'd editable page elements an ID, and leaves locked blocks alone", () => {
    const after = home
      .replace('<h1 data-ui-id="ui_t1tle" className="text-2xl font-semibold">', '<h1 className="text-2xl font-semibold">')
      .replace("</Stack>\n      <Card", '</Stack>\n      <p className="text-sm">{count} orders</p>\n      <OrdersChart data={orders} />\n      <Card');
    const { files, repairs } = repairIds(base, { ...base, [HOME]: after }, { random: seq() });
    const fixed = files[HOME] as string;
    expect(repairs.map((r) => [r.kind, r.element])).toEqual([
      ["assigned", "h1"],
      ["assigned", "p"],
    ]);
    for (const r of repairs) expect(fixed).toContain(`<${r.element} data-ui-id="${r.id}" className=`);
    expect(fixed).toContain("<OrdersChart data={orders} />");
    // Every ID from before the repair survives, and only the two tags changed.
    const beforeIds = collectIds(after).ids.map(([id]) => id);
    const afterIds = new Set(collectIds(fixed).ids.map(([id]) => id));
    for (const id of beforeIds) expect(afterIds.has(id)).toBe(true);
    const diff = diffSources(after, fixed);
    expect(diff.linesAdded).toBe(2);
    expect(diff.linesRemoved).toBe(2);
    expect(fixed.replace(/ data-ui-id="ui_[a-z0-9]{5}"(?= className="text-(2xl font-semibold|sm)")/g, "")).toBe(after);
  });

  it("never mints an ID already in use", () => {
    const after = home.replace(' data-ui-id="ui_t1tle"', "");
    // A random source that would pick ui_aaaaa, which the project already uses.
    const taken = { ...base, [HOME]: after, "src/pages/Other.tsx": 'export default function O() { return <div data-ui-id="ui_aaaaa" />; }\n' };
    let first = true;
    const { repairs } = repairIds(base, taken, { random: () => (first ? ((first = false), 0) : 0.5) });
    expect(repairs.map((r) => r.id)).not.toContain("ui_aaaaa");
  });
});
