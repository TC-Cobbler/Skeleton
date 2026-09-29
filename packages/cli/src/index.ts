#!/usr/bin/env node
// Phase 0 spike CLI: a thin wrapper over @skeleton/core. All I/O lives here.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  analyseTakeBack,
  buildIdIndex,
  buildTree,
  fillMissingIds,
  insert,
  isCleanTakeBack,
  move,
  readTokens,
  remove,
  setClass,
  setProp,
  writeTokens,
  type EditResult,
  type NodeRef,
  type PropValue,
  type Snapshot,
  type TakeBackReport,
  type TokenBlock,
  type UiNode,
} from "@skeleton/core";

const USAGE = `Usage: pnpm spike <command> [--project <dir>] [--json]

Paths are relative to the project root (--project, $SKELETON_PROJECT, or cwd).
A node ref is an ID (ui_abc12) or a child position under an ID (ui_abc12[2]).

Inspect:
  tree <file>                              Classified element tree of a page
  ids                                      Project-wide ID index and duplicates
  tokens                                   Tokens in src/styles/globals.css

Edit (writes the file, prints the diff):
  insert <file> <parentId> <index> <jsx>   Missing data-ui-ids are minted
  move <file> <ref> <newParentId> <index>
  remove <file> <ref> [--allow-locked]
  set-prop <file> <id> <key> <value>       value: JSON literal or bare string; null removes
  set-class <file> <id> [+add|-remove]...
  set-token <name> <value> [--block light|dark|theme|theme-inline]

Take back:
  analyse <beforeRef> [afterRef]           afterRef defaults to the working tree
`;

class UsageError extends Error {}

interface Args {
  positional: string[];
  project: string;
  json: boolean;
  allowLocked: boolean;
  block: TokenBlock | undefined;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const baseDir = process.env.INIT_CWD ?? process.cwd();
  let project = process.env.SKELETON_PROJECT ?? baseDir;
  let json = false;
  let allowLocked = false;
  let block: TokenBlock | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--project") project = argv[++i] ?? "";
    else if (arg === "--json") json = true;
    else if (arg === "--allow-locked") allowLocked = true;
    else if (arg === "--block") {
      const value = argv[++i];
      if (value !== "light" && value !== "dark" && value !== "theme" && value !== "theme-inline") {
        throw new UsageError(`--block must be light, dark, theme or theme-inline`);
      }
      block = value;
    } else positional.push(arg);
  }
  return { positional, project: resolve(baseDir, project), json, allowLocked, block };
}

const TOKEN_FILE = "src/styles/globals.css";

function main(argv: string[]): number {
  const args = parseArgs(argv);
  const [command, ...rest] = args.positional;
  const p = (path: string) => join(args.project, path);
  const need = (n: number) => {
    if (rest.length < n) throw new UsageError(`${command} needs ${n} argument(s)`);
    return rest;
  };
  const edit = (file: string, fn: (source: string) => EditResult) => {
    const before = readFileSync(p(file), "utf8");
    const result = fn(before);
    writeFileSync(p(file), result.source);
    output(args, { file, linesAdded: result.diff.linesAdded, linesRemoved: result.diff.linesRemoved }, result.diff.patch || "(no change)");
  };

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;

    case "tree": {
      const [file] = need(1);
      const tree = buildTree(readFileSync(p(file as string), "utf8"));
      output(args, tree, tree.rootError ?? tree.roots.map((r) => formatTree(r, "")).join(""));
      return 0;
    }

    case "ids": {
      const index = buildIdIndex(worktreeSnapshot(args.project, isTsx));
      const summary = {
        count: index.ids.size,
        duplicates: index.duplicates.map((id) => ({ id, occurrences: index.ids.get(id) })),
        malformed: index.malformed,
      };
      const text = [
        `${index.ids.size} IDs`,
        ...summary.duplicates.map((d) => `DUPLICATE ${d.id}: ${(d.occurrences ?? []).map((o) => `${o.file}:${o.line}`).join(", ")}`),
        ...index.malformed.map((m) => `MALFORMED at ${m.file}:${m.line} <${m.element}>`),
      ].join("\n");
      output(args, summary, text);
      return index.duplicates.length + index.malformed.length > 0 ? 1 : 0;
    }

    case "tokens": {
      const tokens = readTokens(readFileSync(p(TOKEN_FILE), "utf8"));
      output(args, tokens, tokens.map((t) => `${t.block.padEnd(12)} ${t.name}: ${t.value}`).join("\n"));
      return 0;
    }

    case "insert": {
      const [file, parentId, index, jsx] = need(4) as [string, string, string, string];
      const taken = new Set(buildIdIndex(worktreeSnapshot(args.project, isTsx)).ids.keys());
      const filled = fillMissingIds(jsx, taken);
      edit(file, (src) => insert(src, parentId, toIndex(index), filled));
      return 0;
    }

    case "move": {
      const [file, ref, parentId, index] = need(4) as [string, string, string, string];
      edit(file, (src) => move(src, parseRef(ref), parentId, toIndex(index)));
      return 0;
    }

    case "remove": {
      const [file, ref] = need(2) as [string, string];
      edit(file, (src) => remove(src, parseRef(ref), { allowLocked: args.allowLocked }));
      return 0;
    }

    case "set-prop": {
      const [file, id, key, value] = need(4) as [string, string, string, string];
      edit(file, (src) => setProp(src, id, key, parsePropValue(value)));
      return 0;
    }

    case "set-class": {
      const [file, id, ...changes] = need(2) as [string, string, ...string[]];
      const add = changes.filter((c) => c.startsWith("+")).map((c) => c.slice(1));
      const drop = changes.filter((c) => c.startsWith("-")).map((c) => c.slice(1));
      if (add.length + drop.length !== changes.length) throw new UsageError("set-class changes must start with + or -");
      edit(file, (src) => setClass(src, id, add, drop));
      return 0;
    }

    case "set-token": {
      const [name, value] = need(2) as [string, string];
      const before = readFileSync(p(TOKEN_FILE), "utf8");
      const after = writeTokens(before, [args.block ? { name, value, block: args.block } : { name, value }]);
      writeFileSync(p(TOKEN_FILE), after);
      output(args, { name, value, block: args.block ?? null }, `${name}: ${value}`);
      return 0;
    }

    case "analyse": {
      const [beforeRef, afterRef] = need(1) as [string, string | undefined];
      const before = gitSnapshot(args.project, beforeRef);
      const after = afterRef ? gitSnapshot(args.project, afterRef) : worktreeSnapshot(args.project, isProjectSource);
      const report = analyseTakeBack(before, after);
      const clean = isCleanTakeBack(report);
      output(args, { clean, ...report }, formatReport(report, clean));
      return clean ? 0 : 1;
    }

    default:
      throw new UsageError(`unknown command: ${command}`);
  }
}

// ---------------------------------------------------------------------------

function output(args: Args, data: unknown, text: string): void {
  console.log(args.json ? JSON.stringify(data, null, 2) : text);
}

function toIndex(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`index must be a non-negative integer, got ${value}`);
  return n;
}

function parseRef(ref: string): NodeRef {
  const m = /^(ui_[a-z0-9]{5})(?:\[(\d+)\])?$/.exec(ref);
  if (!m) throw new UsageError(`bad node ref: ${ref}`);
  const [, id, index] = m as unknown as [string, string, string | undefined];
  return index === undefined ? { id } : { parentId: id, index: Number(index) };
}

function parsePropValue(value: string): PropValue {
  if (value === "null" || value === "true" || value === "false" || /^-?\d+(\.\d+)?$/.test(value)) {
    return JSON.parse(value) as PropValue;
  }
  return value;
}

function formatTree(node: UiNode, indent: string): string {
  const id = node.id ? ` #${node.id}` : " (no id)";
  const lock = node.lockReason ? ` [${node.lockReason}]` : "";
  const text = node.text ? ` "${node.text}"` : "";
  const inside = node.containedIds.length ? ` contains ${node.containedIds.join(", ")}` : "";
  let out = `${indent}${node.kind.padEnd(9)} ${node.name}${id}${lock}${text}${inside}  L${node.range.startLine}\n`;
  for (const child of node.children) out += formatTree(child, indent + "  ");
  return out;
}

function formatReport(r: TakeBackReport, clean: boolean): string {
  const lines: string[] = [clean ? "CLEAN: IDs intact, no duplicates, tokens untouched" : "NOT CLEAN"];
  const section = (title: string, items: string[]) => {
    lines.push(`\n${title} (${items.length})`);
    for (const item of items) lines.push(`  - ${item}`);
  };
  section("Orphaned IDs", r.orphanedIds.map((o) => `${o.id} (was <${o.lastSeen.element}> ${o.lastSeen.file}:${o.lastSeen.line})`));
  section("Duplicate IDs", r.duplicateIds.map((d) => `${d.id}${d.isNew ? " (new)" : ""}: ${d.occurrences.map((o) => `${o.file}:${o.line}`).join(", ")}`));
  section("Un-ID'd editable nodes", r.unIdedEditable.map((n) => `<${n.element}> ${n.file}:${n.line}`));
  section("New violations", r.newViolations.map((v) => `${v.kind} ${v.value} ${v.file}:${v.line}`));
  section("New locked blocks", r.newLockedBlocks.map((b) => `${b.element} [${b.reason}] ${b.file}:${b.line}`));
  const tt = r.tokenTampering;
  section(
    "Token file tampering",
    tt ? [...tt.changes.map((c) => `${c.block} ${c.name}: ${c.before ?? "(none)"} → ${c.after ?? "(removed)"}`), ...(tt.nonTokenChanges ? ["non-token content changed"] : [])] : [],
  );
  section("Parse errors", r.parseErrors.map((e) => `${e.file}: ${e.message}`));
  return lines.join("\n");
}

const isTsx = (path: string) => path.startsWith("src/") && /\.(tsx|jsx)$/.test(path);
const isProjectSource = (path: string) => path.startsWith("src/");

function worktreeSnapshot(root: string, include: (path: string) => boolean): Snapshot {
  const out: Snapshot = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else {
        const rel = relative(root, abs).split(sep).join("/");
        if (include(rel)) out[rel] = readFileSync(abs, "utf8");
      }
    }
  };
  if (existsSync(join(root, "src"))) walk(join(root, "src"));
  return out;
}

function gitSnapshot(root: string, ref: string): Snapshot {
  const git = (...gitArgs: string[]) => execFileSync("git", ["-C", root, ...gitArgs], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out: Snapshot = {};
  for (const path of git("ls-tree", "-r", "--name-only", ref, "--", "src").split("\n").filter(Boolean)) {
    out[path] = git("show", `${ref}:${path}`);
  }
  return out;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  }
}
