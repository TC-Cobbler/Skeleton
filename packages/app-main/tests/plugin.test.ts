import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, walkTree, type UiNode } from "@skeleton/core";
import { describe, expect, it } from "vitest";
import { tagJsx } from "../launcher/skeleton-plugin.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FILE = "src/pages/HomePage.tsx";

describe("tagJsx", () => {
  for (const fixture of ["base", "post-agent/loop-01", "post-agent/loop-02"]) {
    it(`tags every element at the offset core reports (${fixture})`, () => {
      const source = readFileSync(path.join(repo, "fixtures", fixture, FILE), "utf8");
      const tagged = tagJsx(source, FILE);
      expect(tagged).not.toBeNull();
      const locs = new Set([...(tagged?.code ?? "").matchAll(/data-skeleton-loc="src\/pages\/HomePage\.tsx:(\d+)"/g)].map((m) => Number(m[1])));
      const elements: UiNode[] = [];
      walkTree(buildTree(source).roots, (n) => {
        if (n.kind !== "locked" || n.lockReason === "custom component" || n.lockReason === "spread props") elements.push(n);
      });
      expect(elements.length).toBeGreaterThan(10);
      for (const n of elements) expect(locs.has(n.range.start), `${n.name} ${n.id ?? ""} @${n.range.start}`).toBe(true);
      // The served code still parses as the same page.
      expect(buildTree(tagged?.code ?? "").roots.length).toBe(buildTree(source).roots.length);
    });
  }

  it("skips fragments and leaves untagged code alone", () => {
    const out = tagJsx(`const a = <><Fragment><b /></Fragment></>;`, "f.tsx")?.code;
    expect(out).toBe(`const a = <><Fragment><b data-skeleton-loc="f.tsx:22" /></Fragment></>;`);
    expect(tagJsx(`export const x = 1;`, "f.tsx")).toBeNull();
  });
});
