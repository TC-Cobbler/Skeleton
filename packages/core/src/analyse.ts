import postcss from "postcss";
import { buildIdIndex, type IdOccurrence } from "./ids.js";
import { readTokens, type TokenBlock } from "./tokens.js";
import { buildTree, DEFAULT_CATALOGUE, walkTree, type Catalogue } from "./tree.js";
import { findViolations, type Violation } from "./violations.js";

/** Project files by project-relative POSIX path. */
export type Snapshot = Record<string, string>;

export interface AnalyserConfig {
  /** Page files: parsed into trees for locked-block and un-ID'd-node checks. */
  pagesDir: string;
  /** The token file owned by Skeleton. */
  tokenFile: string;
  /** Scaffold code (shadcn internals, primitives), exempt from violation checks. */
  scaffoldDirs: string[];
  catalogue: Catalogue;
}

export const DEFAULT_ANALYSER_CONFIG: AnalyserConfig = {
  pagesDir: "src/pages/",
  tokenFile: "src/styles/globals.css",
  scaffoldDirs: ["src/components/ui/", "src/components/layout/"],
  catalogue: DEFAULT_CATALOGUE,
};

export interface NodeLocation {
  file: string;
  line: number;
  element: string;
}

export interface LockedBlock extends NodeLocation {
  reason: string;
}

export interface TokenChange {
  name: string;
  block: TokenBlock;
  before: string | null;
  after: string | null;
}

export interface TakeBackReport {
  /** IDs present before, gone after. */
  orphanedIds: { id: string; lastSeen: IdOccurrence }[];
  /** IDs appearing more than once after. `isNew` if they weren't duplicated before. */
  duplicateIds: { id: string; occurrences: IdOccurrence[]; isNew: boolean }[];
  /** Editable (non-locked) nodes in page files with no data-ui-id. */
  unIdedEditable: NodeLocation[];
  /** Locked JSX elements (custom components, wrappers) in page files with no data-ui-id. Contract rule 1. */
  unIdedLocked: NodeLocation[];
  newViolations: Violation[];
  newLockedBlocks: LockedBlock[];
  /** Null when the token file is byte-identical. */
  tokenTampering: { changes: TokenChange[]; nonTokenChanges: boolean } | null;
  /** Files that failed to parse after the pass. */
  parseErrors: { file: string; message: string }[];
}

const isSource = (path: string) => /\.(tsx|ts|jsx|js)$/.test(path) && path.startsWith("src/");

export function analyseTakeBack(before: Snapshot, after: Snapshot, config: AnalyserConfig = DEFAULT_ANALYSER_CONFIG): TakeBackReport {
  const parseErrors: TakeBackReport["parseErrors"] = [];
  const safe = <T>(file: string, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      parseErrors.push({ file, message: e instanceof Error ? e.message : String(e) });
      return fallback;
    }
  };
  const sources = (snap: Snapshot, record: boolean): Snapshot => {
    const out: Snapshot = {};
    for (const [path, content] of Object.entries(snap)) {
      if (!isSource(path)) continue;
      // Only after-pass parse failures are reported; before is assumed valid.
      if (record) {
        if (safe(path, () => (buildIdIndex({ [path]: content }), true), false)) out[path] = content;
      } else {
        out[path] = content;
      }
    }
    return out;
  };
  const beforeSrc = sources(before, false);
  const afterSrc = sources(after, true);

  // IDs
  const beforeIds = buildIdIndex(beforeSrc);
  const afterIds = buildIdIndex(afterSrc);
  const orphanedIds = [...beforeIds.ids]
    .filter(([id]) => !afterIds.ids.has(id))
    .map(([id, occ]) => ({ id, lastSeen: occ[0] as IdOccurrence }));
  const duplicateIds = afterIds.duplicates.map((id) => ({
    id,
    occurrences: afterIds.ids.get(id) ?? [],
    isNew: !beforeIds.duplicates.includes(id),
  }));

  // Page trees: un-ID'd editable nodes and locked blocks
  const unIdedEditable: NodeLocation[] = [];
  const unIdedLocked: NodeLocation[] = [];
  const lockedBlocks = (snap: Snapshot, file: string): { block: LockedBlock; text: string }[] => {
    const source = snap[file];
    if (source === undefined) return [];
    const tree = buildTree(source, config.catalogue);
    const out: { block: LockedBlock; text: string }[] = [];
    walkTree(tree.roots, (node) => {
      if (node.kind !== "locked") return;
      out.push({
        block: { file, line: node.range.startLine, element: node.id ? `${node.name}#${node.id}` : node.name, reason: node.lockReason ?? "locked" },
        text: normalise(source.slice(node.range.start, node.range.end)),
      });
    });
    return out;
  };
  const newLockedBlocks: LockedBlock[] = [];
  for (const file of Object.keys(afterSrc).filter((f) => f.startsWith(config.pagesDir) && f.endsWith("x"))) {
    const source = afterSrc[file] as string;
    const tree = buildTree(source, config.catalogue);
    walkTree(tree.roots, (node) => {
      if (node.id !== null) return;
      const at = { file, line: node.range.startLine, element: node.name };
      if (node.kind !== "locked") unIdedEditable.push(at);
      else if (node.lockReason !== null && isElementLock(node.lockReason)) unIdedLocked.push(at);
    });
    const previous = new Set(safe(file, () => lockedBlocks(beforeSrc, file), []).map((b) => b.text));
    for (const { block, text } of lockedBlocks(afterSrc, file)) {
      if (!previous.has(text)) newLockedBlocks.push(block);
    }
  }

  // Violations (outside scaffold code)
  const violationsOf = (snap: Snapshot) =>
    Object.entries(snap)
      .filter(([f]) => f.endsWith("x") && !config.scaffoldDirs.some((d) => f.startsWith(d)))
      .flatMap(([f, src]) => safe(f, () => findViolations(src, f), []));
  const beforeCounts = new Map<string, number>();
  for (const v of violationsOf(beforeSrc)) {
    const key = violationKey(v);
    beforeCounts.set(key, (beforeCounts.get(key) ?? 0) + 1);
  }
  const newViolations: Violation[] = [];
  for (const v of violationsOf(afterSrc)) {
    const key = violationKey(v);
    const left = beforeCounts.get(key) ?? 0;
    if (left > 0) beforeCounts.set(key, left - 1);
    else newViolations.push(v);
  }

  return {
    orphanedIds,
    duplicateIds,
    unIdedEditable,
    unIdedLocked,
    newViolations,
    newLockedBlocks,
    tokenTampering: compareTokenFiles(before[config.tokenFile], after[config.tokenFile]),
    parseErrors,
  };
}

/** True when nothing in the report breaks the round-trip guarantees. */
export function isCleanTakeBack(report: TakeBackReport): boolean {
  return (
    report.orphanedIds.length === 0 &&
    report.duplicateIds.length === 0 &&
    report.tokenTampering === null &&
    report.parseErrors.length === 0
  );
}

/** Locks that come from a JSX element (as opposed to `.map`, conditionals and other expressions). */
function isElementLock(reason: string): boolean {
  return reason === "custom component" || reason === "spread props" || reason.endsWith(" prop") || reason === "member or namespaced element";
}

function violationKey(v: Violation): string {
  return `${v.file}\0${v.kind}\0${v.value}`;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compareTokenFiles(before: string | undefined, after: string | undefined): TakeBackReport["tokenTampering"] {
  if (before === after) return null;
  if (before === undefined || after === undefined) {
    return { changes: [], nonTokenChanges: true };
  }
  const key = (name: string, block: TokenBlock) => `${block}\0${name}`;
  const b = new Map(readTokens(before).map((tk) => [key(tk.name, tk.block), tk]));
  const a = new Map(readTokens(after).map((tk) => [key(tk.name, tk.block), tk]));
  const changes: TokenChange[] = [];
  for (const [k, tk] of b) {
    const next = a.get(k);
    if (!next || next.value !== tk.value) changes.push({ name: tk.name, block: tk.block, before: tk.value, after: next?.value ?? null });
  }
  for (const [k, tk] of a) if (!b.has(k)) changes.push({ name: tk.name, block: tk.block, before: null, after: tk.value });
  return { changes, nonTokenChanges: blankTokenValues(before) !== blankTokenValues(after) };
}

/** The file with every custom-property declaration removed, so only non-token content remains. */
function blankTokenValues(css: string): string {
  const root = postcss.parse(css);
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) decl.remove();
  });
  return root.toString();
}
