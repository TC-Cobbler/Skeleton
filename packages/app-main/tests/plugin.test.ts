import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, sourceVersion, walkTree, type UiNode } from "@skeleton/core";
import { describe, expect, it } from "vitest";
import { skeletonPlugin, tagJsx } from "../launcher/skeleton-plugin.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FILE = "src/pages/HomePage.tsx";

describe("tagJsx", () => {
  for (const fixture of ["base", "post-agent/loop-01", "post-agent/loop-02"]) {
    it(`tags every element at the offset core reports (${fixture})`, () => {
      const source = readFileSync(path.join(repo, "fixtures", fixture, FILE), "utf8");
      const tagged = tagJsx(source, FILE);
      expect(tagged).not.toBeNull();
      const matches = [...(tagged?.code ?? "").matchAll(/data-skeleton-loc="src\/pages\/HomePage\.tsx:(\d+)@([0-9a-f]{14})"/g)];
      const locs = new Set(matches.map((m) => Number(m[1])));
      // Every loc carries the version of the text it was compiled from.
      expect(new Set(matches.map((m) => m[2]))).toEqual(new Set([sourceVersion(source)]));
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
    const code = `const a = <><Fragment><b /></Fragment></>;`;
    const out = tagJsx(code, "f.tsx")?.code;
    expect(out).toBe(`const a = <><Fragment><b data-skeleton-loc="f.tsx:22@${sourceVersion(code)}" /></Fragment></>;`);
    expect(tagJsx(`export const x = 1;`, "f.tsx")).toBeNull();
  });
});

describe("skeletonPlugin", () => {
  it("has Vite scan every source file for dependencies up front", () => {
    const plugin = skeletonPlugin({ root: "/p", overlayBundle: "/o.js" }) as unknown as { config: () => unknown };
    expect(plugin.config()).toEqual({ optimizeDeps: { entries: ["index.html", "src/**/*.{ts,tsx,js,jsx}"] } });
  });
});
