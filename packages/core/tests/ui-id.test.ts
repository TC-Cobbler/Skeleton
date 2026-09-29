import { describe, expect, it } from "vitest";
import { buildIdIndex, collectIds, isUiId, mintId } from "../src/index.js";
import { readFixture } from "./helpers.js";

describe("isUiId", () => {
  it("accepts ui_ + 5 lowercase alphanumerics", () => {
    expect(isUiId("ui_k3m9x")).toBe(true);
  });

  it.each(["ui_K3M9X", "ui_k3m9", "ui_k3m9xx", "k3m9x", "ui-k3m9x", ""])("rejects %j", (value) => {
    expect(isUiId(value)).toBe(false);
  });
});

describe("mintId", () => {
  it("mints well-formed IDs and records them as taken", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) expect(isUiId(mintId(taken))).toBe(true);
    expect(taken.size).toBe(500);
  });

  it("skips IDs that are already taken", () => {
    let calls = 0;
    // First five draws spell ui_aaaaa (taken), next five spell ui_bbbbb.
    const random = () => (calls++ < 5 ? 0 : 1 / 36 + 1e-9);
    const taken = new Set(["ui_aaaaa"]);
    expect(mintId(taken, random)).toBe("ui_bbbbb");
  });
});

describe("buildIdIndex", () => {
  it("indexes the base fixture with no duplicates", () => {
    const index = buildIdIndex({ "src/pages/HomePage.tsx": readFixture("base/src/pages/HomePage.tsx") });
    expect(index.duplicates).toEqual([]);
    expect(index.malformed).toEqual([]);
    expect(index.ids.size).toBe(20);
    expect(index.ids.get("ui_tbl01")).toEqual([{ file: "src/pages/HomePage.tsx", line: 30, element: "Table" }]);
  });

  it("finds duplicates across files and inside locked blocks", () => {
    const a = `export default () => <div data-ui-id="ui_aaaaa"><p data-ui-id="ui_bbbbb" /></div>;`;
    const b = `export const X = () => <>{xs.map(() => <i data-ui-id="ui_aaaaa" />)}</>;`;
    const index = buildIdIndex({ "a.tsx": a, "b.tsx": b });
    expect(index.duplicates).toEqual(["ui_aaaaa"]);
  });

  it("reports malformed and non-literal IDs", () => {
    const src = `export default () => <div data-ui-id="UI_1"><p data-ui-id={id} /></div>;`;
    expect(collectIds(src).malformed).toHaveLength(2);
  });
});
