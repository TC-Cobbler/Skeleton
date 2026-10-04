// The plain-words check (T8.2, docs/ui-refresh-spec.md §7): the words Skeleton shows
// live in two copy files, and none of them may use a word GLOSSARY.md says to avoid.
// Today's jargon is listed in plain-words.pending.ts; each slice of the UI refresh
// shrinks that list, and it's empty by the phase's gate.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COPY_FILES = { renderer: "packages/app-renderer/src/copy.ts", overlay: "packages/overlay/src/copy.ts" };

/**
 * Copy entries written for the agent or showing raw code, where code words belong
 * (spec §4, §7): Details, Copy details, the read-only page code view and the app
 * preview log, plus the versions Skeleton runs on in About (Electron, Node).
 */
const PLUMBING = [/(^|[:.])details(\.|$)/, /(^|[:.])copyDetails(\.|$)/, /^renderer:viewSource\.where$/, /^renderer:devServer\.log(\.|$)/, /^renderer:app\.info$/];

/**
 * Avoid-words that are also ordinary English in the sense Skeleton uses them:
 * "Select an element", "Sends the form", "Drag to move", "Wrap onto new lines", the
 * App theme's Light and Dark, the approved setting label "Direction", and key names.
 */
const ORDINARY = new Set(["select", "send", "submit", "drag", "shift", "alt", "light", "dark", "wrap", "direction"]);

/** Every word or phrase GLOSSARY.md lists under _Avoid_, as lower-case text to look for. */
export function avoidTerms(glossary: string): string[] {
  const terms = new Set<string>();
  for (const [, list] of glossary.matchAll(/^_Avoid_: (.+)$/gm)) {
    for (let term of (list ?? "").split(", ")) {
      term = term.replace(/`/g, "").replace(/\s+\([^)]*\)/g, "").replace(/…$/, "").trim();
      // "component/global/instance" lists three words; "Light/dark value" is one phrase.
      const parts = /^[a-z]+(\/[a-z]+)+$/i.test(term) ? term.split("/") : [term];
      for (const part of parts) if (part && !ORDINARY.has(part.toLowerCase())) terms.add(part.toLowerCase());
    }
  }
  return [...terms];
}

/** GLOSSARY.md's own terms (its bold headings), which may contain an avoid-word: "Agent component". */
export function glossaryTerms(glossary: string): string[] {
  return [...glossary.matchAll(/^\*\*(.+?)\*\*:?\s*$/gm)].map(([, term]) => (term ?? "").toLowerCase());
}

/** Whether `text` uses `term`: whole words for words, plain substrings for code like `.map()`. */
export function uses(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  if (!/^[a-z][a-z -]*[a-z]$/.test(term)) return lower.includes(term);
  return new RegExp(`(^|[^a-z0-9-])${term.replace(/[-]/g, "\\-")}($|[^a-z0-9-])`).test(lower);
}

/** The literal text of every string and template in a copy file, by its property path. */
function copyTexts(file: string, prefix: string): { path: string; text: string }[] {
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
  const out: { path: string; text: string }[] = [];
  const visit = (node: ts.Node, at: string[]) => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/^["']|["']$/g, "");
      visit(node.initializer, [...at, name]);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ path: at.join("."), text: node.text });
    else if (ts.isTemplateExpression(node)) out.push({ path: at.join("."), text: [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ") });
    ts.forEachChild(node, (child) => visit(child, at));
  };
  const copy = source.statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0]?.name.getText(source) === "copy");
  if (!copy) throw new Error(`${file} has no copy object`);
  visit(copy, []);
  return out.filter((t) => t.path !== "").map((t) => ({ path: `${prefix}:${t.path}`, text: t.text }));
}

/** Every use of an avoid-word on screen, as "path: term". */
export function jargon(): string[] {
  const glossary = readFileSync(path.join(root, "GLOSSARY.md"), "utf8");
  const terms = avoidTerms(glossary);
  const own = glossaryTerms(glossary).filter((g) => terms.some((term) => uses(g, term)));
  const found = new Set<string>();
  for (const [prefix, file] of Object.entries(COPY_FILES)) {
    for (const { path: at, text: said } of copyTexts(file, prefix)) {
      // A glossary term is the plain word, whatever words it's made of.
      const text = own.reduce((t, term) => t.split(term).join(" "), said.toLowerCase());
      if (PLUMBING.some((p) => p.test(at))) continue;
      for (const term of terms) if (uses(text, term)) found.add(`${at}: ${term}`);
      // Theme values by their code name, e.g. --primary.
      if (/(^|[\s(])--[a-z]/.test(text)) found.add(`${at}: --name`);
    }
  }
  return [...found].sort();
}

