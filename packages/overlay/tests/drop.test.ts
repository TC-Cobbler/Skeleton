import { describe, expect, it } from "vitest";
import { besideSide, dropIndex, edgeScroll, flowOf, indicatorRect, unionRect, type PlacedChild } from "../src/drop.js";

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

describe("besideSide", () => {
  const card = r(100, 100, 200, 120);
  // A Card's content, inset by its padding.
  const padded = { rect: card, flow: "vertical" as const, children: [r(124, 124, 152, 72)] };

  it("goes before or after at the edges along the parent's flow (F-1, F-4)", () => {
    // In a column: the top and bottom bands.
    expect(besideSide("vertical", padded, 200, 103)).toBe("before");
    expect(besideSide("vertical", padded, 200, 216)).toBe("after");
    expect(besideSide("vertical", padded, 102, 160)).toBeNull();
    // In a row or a grid: the left and right bands.
    expect(besideSide("horizontal", padded, 104, 160)).toBe("before");
    expect(besideSide("grid", padded, 295, 160)).toBe("after");
    expect(besideSide("grid", padded, 200, 103)).toBeNull();
  });

  it("goes into the middle", () => {
    expect(besideSide("vertical", padded, 200, 160)).toBeNull();
    expect(besideSide("horizontal", padded, 200, 160)).toBeNull();
  });

  it("across axes, counts the band even over a child: a toolbar's bottom edge (F-1)", () => {
    const toolbar = { rect: r(0, 0, 400, 36), flow: "horizontal" as const, children: [r(0, 0, 300, 36), r(308, 0, 92, 36)] };
    expect(besideSide("vertical", toolbar, 150, 32)).toBe("after");
    expect(besideSide("vertical", toolbar, 150, 18)).toBeNull();
    // A Card (a column) in a grid, its content flush to the right edge.
    const card = { rect: r(0, 0, 200, 120), flow: "vertical" as const, children: [r(0, 0, 200, 120)] };
    expect(besideSide("grid", card, 196, 60)).toBe("after");
  });

  it("along the same axis, only where no child is under the point: last-in vs after", () => {
    // A column of one paragraph, flush with the column's bottom, in a column.
    const column = { rect: r(0, 0, 400, 24), flow: "vertical" as const, children: [r(0, 0, 400, 24)] };
    expect(besideSide("vertical", column, 200, 22)).toBeNull();
    // With padding below it, the padding is "after the column".
    const paddedColumn = { rect: r(0, 0, 400, 40), flow: "vertical" as const, children: [r(0, 0, 400, 24)] };
    expect(besideSide("vertical", paddedColumn, 200, 36)).toBe("after");
    // A grid container is both axes.
    const grid = { rect: r(0, 0, 400, 100), flow: "grid" as const, children: [r(0, 0, 200, 100), r(200, 0, 200, 100)] };
    expect(besideSide("vertical", grid, 100, 96)).toBeNull();
    expect(besideSide("horizontal", grid, 398, 50)).toBeNull();
  });

  it("keeps a middle in a small container: the band is at most a quarter of it", () => {
    const thin = { rect: r(0, 0, 100, 16), flow: "vertical" as const, children: [] };
    expect(besideSide("vertical", thin, 50, 3)).toBe("before");
    expect(besideSide("vertical", thin, 50, 5)).toBeNull();
    expect(besideSide("vertical", thin, 50, 12)).toBe("after");
    expect(besideSide("vertical", { ...thin, rect: r(0, 0, 100, 0) }, 50, 0)).toBeNull();
  });
});
