// Phase 6 (T6.3) checks, independent of Skeleton's own analyser: git, regexes and a build.
//   node verify.mjs pass <N>    after take back N: IDs, tokens, build
//   node verify.mjs edits <N>   after handoff N+1: Skeleton's edits since pass N vs agent-authored lines
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.DOGFOOD_ROOT ?? "/home/user/dogfood/game-library";
const LEDGER = process.env.DOGFOOD_LEDGER ?? "/home/user/dogfood/tokens.json"; // { "--radius": "0.75rem", "--primary.dark": "..." }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const commit = (subject) => {
  const line = git("log", "--format=%H %s").split("\n").find((l) => l.slice(41) === subject);
  if (!line) throw new Error(`no commit "${subject}"`);
  return line.slice(0, 40);
};
const ID = /data-ui-id="([^"]*)"/g;
const srcFiles = (rev) =>
  (rev ? git("ls-tree", "-r", "--name-only", rev, "src") : git("ls-files", "--cached", "--others", "--exclude-standard", "src"))
    .split("\n")
    .filter((f) => /\.(tsx|jsx)$/.test(f));
const content = (rev, f) => (rev ? git("show", `${rev}:${f}`) : readFileSync(path.join(ROOT, f), "utf8"));
function ids(rev) {
  const all = [];
  for (const f of srcFiles(rev)) for (const m of content(rev, f).matchAll(ID)) all.push({ id: m[1], f });
  return all;
}
/** Token values in @theme / :root / .dark blocks of globals.css. */
function tokens() {
  const css = readFileSync(path.join(ROOT, "src/styles/globals.css"), "utf8");
  const out = {};
  const block = (sel) => {
    const m = new RegExp(`${sel}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
    return m ? m[1] : "";
  };
  for (const [scope, body] of [["", block(":root")], [".dark", block("\\.dark")], ["", block("@theme(?: inline)?")]]) {
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!(`${m[1]}${scope}` in out)) out[`${m[1]}${scope}`] = m[2].trim();
  }
  return out;
}

const [mode, nArg] = process.argv.slice(2);
const n = Number(nArg);
let ok = true;
const fail = (s) => {
  ok = false;
  console.log(`  ✗ ${s}`);
};
const pass = (s) => console.log(`  ✓ ${s}`);

if (mode === "pass") {
  const h = commit(`skeleton: handoff #${n}`);
  const p = commit(`agent: pass #${n}`);
  console.log(`Loop ${n}: handoff ${h.slice(0, 7)} → pass ${p.slice(0, 7)} (+ take-back repairs in the working tree)`);
  // 1. IDs
  const before = ids(h);
  const now = ids(null);
  const nowSet = new Set(now.map((x) => x.id));
  const lost = before.filter((x) => !nowSet.has(x.id));
  const counts = new Map();
  for (const x of now) counts.set(x.id, (counts.get(x.id) ?? 0) + 1);
  const dups = [...counts].filter(([, c]) => c > 1);
  const bad = now.filter((x) => !/^ui_[a-z0-9]{5}$/.test(x.id));
  const agentAdded = [...nowSet].filter((id) => !before.some((x) => x.id === id));
  lost.length ? fail(`IDs lost: ${lost.map((x) => `${x.id} (${x.f})`).join(", ")}`) : pass(`ID survival: ${before.length}/${before.length} IDs from the handoff survive`);
  dups.length ? fail(`duplicate IDs: ${dups.map(([i, c]) => `${i}×${c}`).join(", ")}`) : pass(`no duplicate IDs (${now.length} in src)`);
  bad.length ? fail(`malformed IDs: ${bad.map((x) => x.id).join(", ")}`) : pass("all IDs well-formed");
  console.log(`    new IDs this pass: ${agentAdded.length}`);
  // 2. Tokens
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  const t = tokens();
  const drift = Object.entries(ledger).filter(([k, v]) => t[k] !== v);
  drift.length ? fail(`token edits lost: ${drift.map(([k, v]) => `${k} want ${v} got ${t[k]}`).join(", ")}`) : pass(`token edits intact (${Object.keys(ledger).length})`);
  const agentCss = git("diff", "--stat", h, p, "--", "src/styles/globals.css").trim();
  agentCss ? fail(`agent changed globals.css: ${agentCss}`) : pass("agent didn't touch globals.css");
  // 3. Build
  try {
    execFileSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });
    pass("pnpm run build passes");
  } catch (e) {
    fail(`build fails:\n${String(e.stdout ?? "").slice(-1500)}${String(e.stderr ?? "").slice(-800)}`);
  }
} else if (mode === "edits") {
  // Skeleton's edits after pass N (committed in handoff N+1) must not alter agent-authored lines,
  // beyond re-indenting them (moves) and the opening tags Skeleton targeted.
  const h = commit(`skeleton: handoff #${n}`);
  const p = commit(`agent: pass #${n}`);
  const h2 = commit(`skeleton: handoff #${n + 1}`);
  const norm = (l) => l.trim();
  const agentLines = new Map(); // file → multiset of trimmed lines the agent added
  for (const f of git("diff", "--name-only", h, p, "--", "src").split("\n").filter(Boolean)) {
    const added = git("diff", "-U0", h, p, "--", f).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => norm(l.slice(1))).filter(Boolean);
    agentLines.set(f, added);
  }
  console.log(`Loop ${n} edits: pass ${p.slice(0, 7)} → handoff #${n + 1} ${h2.slice(0, 7)}`);
  let touched = 0;
  for (const f of git("diff", "--name-only", p, h2, "--", "src").split("\n").filter(Boolean)) {
    const agent = agentLines.get(f) ?? [];
    const diff = git("diff", "-U0", p, h2, "--", f).split("\n");
    const removed = diff.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => norm(l.slice(1))).filter(Boolean);
    const added = diff.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => norm(l.slice(1)));
    // A removed agent line that comes back (re-indented) is a move, not a change.
    const pool = [...added];
    for (const r of removed) {
      if (!agent.includes(r)) continue;
      const i = pool.indexOf(r);
      if (i >= 0) {
        pool.splice(i, 1);
        continue;
      }
      touched++;
      console.log(`  ? ${f}: agent line changed or removed: ${r}`);
    }
  }
  touched ? console.log(`  → ${touched} agent-authored line(s) changed: each must be an opening tag Skeleton targeted (review)`) : pass("no agent-authored line changed beyond indentation");
}
console.log(ok ? "RESULT: clean" : "RESULT: NOT clean");
process.exit(ok ? 0 : 1);
