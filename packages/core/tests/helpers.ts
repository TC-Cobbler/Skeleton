import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { collectIds, diffSources, parseModule, type EditResult } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function readFixture(path: string): string {
  return readFileSync(repoRoot + "fixtures/" + path, "utf8");
}

export interface LineRange {
  start: number;
  end: number;
}

/**
 * The four assertions every edit op must pass (CLAUDE.md, "Coding rules for core"):
 * 1. the output parses
 * 2. the diff only touches lines inside `allowed` (old-file line numbers, inclusive)
 * 3. every pre-existing data-ui-id survives, except `removedIds`
 * 4. code outside the allowed ranges is byte-identical
 */
export function assertSurgical(before: string, result: EditResult, allowed: LineRange[], removedIds: string[] = []): void {
  // 1. parses
  expect(() => parseModule(result.source)).not.toThrow();

  // 2. diff confined to allowed old-line ranges
  const diff = diffSources(before, result.source);
  expect(result.diff.patch).toBe(diff.patch);
  for (const hunk of diff.hunks) {
    // jsdiff's structured hunks put a pure insertion *before* old line `oldStart`.
    const first = hunk.oldStart;
    const last = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart + hunk.oldLines - 1;
    const inside = allowed.some((r) =>
      hunk.oldLines === 0 ? first >= r.start && first <= r.end + 1 : first >= r.start && last <= r.end,
    );
    expect(inside, `hunk at old lines ${first}-${last} outside ${JSON.stringify(allowed)}\n${diff.patch}`).toBe(true);
  }

  // 3. IDs survive
  const beforeIds = collectIds(before).ids.map(([id]) => id);
  const afterIds = new Set(collectIds(result.source).ids.map(([id]) => id));
  for (const id of beforeIds) {
    if (!removedIds.includes(id)) expect(afterIds.has(id), `lost ${id}`).toBe(true);
  }
  for (const id of removedIds) expect(afterIds.has(id), `${id} should be gone`).toBe(false);

  // 4. byte-identical outside the allowed span
  const start = Math.min(...allowed.map((r) => r.start));
  const end = Math.max(...allowed.map((r) => r.end));
  const b = before.split("\n");
  const a = result.source.split("\n");
  expect(a.slice(0, start - 1).join("\n")).toBe(b.slice(0, start - 1).join("\n"));
  const tail = b.length - end;
  expect(a.slice(a.length - tail).join("\n")).toBe(b.slice(b.length - tail).join("\n"));
}

/** 1-based line range of the first line containing `needle` through the first later line containing `endNeedle`. */
export function linesOf(source: string, needle: string, endNeedle?: string): LineRange {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.includes(needle));
  if (start < 0) throw new Error(`"${needle}" not found`);
  if (endNeedle === undefined) return { start: start + 1, end: start + 1 };
  const end = lines.findIndex((l, i) => i >= start && l.includes(endNeedle));
  if (end < 0) throw new Error(`"${endNeedle}" not found after "${needle}"`);
  return { start: start + 1, end: end + 1 };
}

/** All files under `fixtures/<dir>/src` plus the fixture root files, keyed by project-relative path. */
export function readFixtureSnapshot(dir: string): Record<string, string> {
  const base = repoRoot + "fixtures/" + dir + "/";
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const entry of readdirSync(base + rel, { withFileTypes: true })) {
      const path = rel + entry.name;
      if (entry.isDirectory()) walk(path + "/");
      else out[path] = readFileSync(base + path, "utf8");
    }
  };
  walk("src/");
  return out;
}
