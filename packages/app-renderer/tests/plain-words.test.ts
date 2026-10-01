// The plain-words check (T8.2, docs/ui-refresh-spec.md §7). How it reads the copy
// files and the glossary is in plain-words.ts; today's jargon is plain-words.pending.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avoidTerms, jargon, root, uses } from "./plain-words.js";
import { PENDING } from "./plain-words.pending.js";

describe("plain words on screen (T8.2)", () => {
  it("knows the glossary's avoid-words", () => {
    const terms = avoidTerms(readFileSync(path.join(root, "GLOSSARY.md"), "utf8"));
    expect(terms).toEqual(expect.arrayContaining(["token", "data-ui-id", "dev server", "violation", ".map()", "orphans", "prop"]));
    expect(terms).not.toContain("select");
  });

  it("finds whole words, and code as written", () => {
    expect(uses("Edit the token", "token")).toBe(true);
    expect(uses("Tokens", "tokens")).toBe(true);
    expect(uses("Tokenised", "token")).toBe(false);
    expect(uses("Has no data-ui-id.", "data-ui-id")).toBe(true);
    expect(uses("🔒 .map()", ".map()")).toBe(true);
  });

  it("uses no avoid-word beyond the pending list", () => {
    const pending = new Set(PENDING);
    expect(jargon().filter((j) => !pending.has(j))).toEqual([]);
  });

  it("has no pending entry that's already fixed (shrink the list)", () => {
    const found = new Set(jargon());
    expect(PENDING.filter((p) => !found.has(p))).toEqual([]);
  });
});
