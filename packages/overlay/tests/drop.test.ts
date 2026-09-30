import { describe, expect, it } from "vitest";
import { dropIndex, edgeScroll, flowOf, indicatorRect, unionRect, type PlacedChild } from "../src/drop.js";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("flowOf", () => {
  it("reads flex direction and grid, defaulting to vertical", () => {
    expect(flowOf("flex", "column")).toBe("vertical");
    expect(flowOf("flex", "row")).toBe("horizontal");
    expect(flowOf("inline-flex", "row-reverse")).toBe("horizontal");
    expect(flowOf("grid", "row", "552px 552px")).toBe("grid");
    expect(flowOf("grid", "row", "[full-start] 200px [mid] 200px [full-end]")).toBe("grid");
    // One column (a card header): children stack.
    expect(flowOf("grid", "row", "1104px")).toBe("vertical");
    expect(flowOf("inline-grid", "row", "none")).toBe("vertical");
    expect(flowOf("block", "row")).toBe("vertical");
  });
});

describe("dropIndex", () => {
  // A column: three 40px children with 10px gaps, the middle one not rendered.
  const column: PlacedChild[] = [
    { index: 0, rect: r(0, 0, 100, 40) },
    { index: 2, rect: r(0, 50, 100, 40) },
    { index: 3, rect: r(0, 100, 100, 40) },
  ];

  it("inserts before the first child whose midpoint the point is above", () => {
    expect(dropIndex("vertical", column, 50, 5, 4)).toBe(0);
    expect(dropIndex("vertical", column, 50, 25, 4)).toBe(2);
    expect(dropIndex("vertical", column, 50, 95, 4)).toBe(3);
    expect(dropIndex("vertical", column, 50, 130, 4)).toBe(4);
  });

  it("uses x for a row", () => {
    const row: PlacedChild[] = [
      { index: 0, rect: r(0, 0, 40, 20) },
      { index: 1, rect: r(50, 0, 40, 20) },
    ];
    expect(dropIndex("horizontal", row, 10, 500, 2)).toBe(0);
    expect(dropIndex("horizontal", row, 60, 0, 2)).toBe(1);
    expect(dropIndex("horizontal", row, 80, 0, 2)).toBe(2);
  });

  it("goes row by row in a grid", () => {
    // 2 columns × 2 rows.
    const grid: PlacedChild[] = [
      { index: 0, rect: r(0, 0, 40, 40) },
      { index: 1, rect: r(50, 0, 40, 40) },
      { index: 2, rect: r(0, 50, 40, 40) },
      { index: 3, rect: r(50, 50, 40, 40) },
    ];
    expect(dropIndex("grid", grid, 5, 20, 4)).toBe(0);
    expect(dropIndex("grid", grid, 30, 20, 4)).toBe(1);
    expect(dropIndex("grid", grid, 85, 20, 4)).toBe(2);
    expect(dropIndex("grid", grid, 60, 70, 4)).toBe(3);
    expect(dropIndex("grid", grid, 85, 70, 4)).toBe(4);
  });

  it("appends to an empty container", () => {
    expect(dropIndex("vertical", [], 0, 0, 0)).toBe(0);
    expect(dropIndex("vertical", [], 0, 0, 2)).toBe(2);
  });
});

describe("indicatorRect", () => {
  const container = r(0, 0, 100, 140);
  const column: PlacedChild[] = [
    { index: 0, rect: r(0, 0, 100, 40) },
    { index: 1, rect: r(0, 50, 100, 40) },
  ];

  it("draws a line across the container, midway in the gap", () => {
    expect(indicatorRect("vertical", container, column, 1)).toEqual({ rect: r(0, 44, 100, 2), fill: false });
    expect(indicatorRect("vertical", container, column, 0)).toEqual({ rect: r(0, -3, 100, 2), fill: false });
    expect(indicatorRect("vertical", container, column, 2)).toEqual({ rect: r(0, 91, 100, 2), fill: false });
  });

  it("draws a vertical line for rows and grids", () => {
    const row: PlacedChild[] = [
      { index: 0, rect: r(0, 0, 40, 20) },
      { index: 1, rect: r(50, 0, 40, 20) },
    ];
    expect(indicatorRect("horizontal", r(0, 0, 90, 30), row, 1)).toEqual({ rect: r(44, 0, 2, 30), fill: false });
    expect(indicatorRect("grid", r(0, 0, 90, 30), row, 2)).toEqual({ rect: r(91, 0, 2, 20), fill: false });
  });

  it("fills an empty container", () => {
    expect(indicatorRect("vertical", container, [], 0)).toEqual({ rect: container, fill: true });
  });
});

describe("unionRect", () => {
  it("covers every rect", () => {
    expect(unionRect([r(10, 10, 10, 10), r(0, 30, 5, 5)])).toEqual(r(0, 10, 20, 25));
    expect(unionRect([])).toBeNull();
  });
});

describe("edgeScroll", () => {
  it("scrolls near the edges, faster closer to them", () => {
    expect(edgeScroll(300, 600)).toBe(0);
    expect(edgeScroll(48, 600)).toBe(0);
    expect(edgeScroll(24, 600)).toBeLessThan(0);
    expect(edgeScroll(0, 600)).toBeLessThan(edgeScroll(24, 600));
    expect(edgeScroll(-50, 600)).toBe(-18);
    expect(edgeScroll(590, 600)).toBeGreaterThan(0);
    expect(edgeScroll(700, 600)).toBe(18);
  });
});
