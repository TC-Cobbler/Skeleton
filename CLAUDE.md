# CLAUDE.md — Skeleton (working name)

You are helping build **Skeleton**, an Electron desktop app for visually defining the UI of React apps that are built with AI agents. The code round-trips between Skeleton and the agent without loss.

Read these before starting any task:
- `PRD.md`: what we're building and why
- `TASKS.md`: current phase, next task, gates
- `ROADMAP.md`: what's deferred (don't build it early)
- `docs/decisions/`: recorded architecture decisions

---

## Current phase

**Phase 0: round-trip spike (headless, no UI).** Don't build Electron, canvas or any UI until Gate 0 passes. If a task seems to need UI, stop and ask.

---

## Non-negotiables

1. **Code is the source of truth.** Never introduce a persistent layout model that lives separately from the project's source files. Parsed trees are derived data, and they're discarded whenever the files change.
2. **Surgical edits only.** Every edit to a user project is a minimal AST patch. Never regenerate, reprint or reformat a whole file. Prettier runs only on the changed ranges or nodes.
3. **Never alter code Skeleton didn't place, beyond the targeted node.** Any change to agent-authored logic that the user didn't explicitly request counts as a critical bug.
4. **`data-ui-id` is sacred.** Format: `ui_` + 5 lowercase alphanumerics, unique within the project. Never drop, duplicate or rewrite an existing ID.
5. **Tokens live in `@theme` in `globals.css`, and are owned by the token writer.** No other module writes to that file.
6. **Respect the scope in PRD §5 and ROADMAP.md.** Don't add frameworks, palette components, breakpoint editing, MCP or anything else that's deferred, even if it's easy to add.

---

## Stack (Skeleton itself)

- **Language:** TypeScript (strict), throughout
- **Shell:** Electron. The main process runs Node; the renderer runs React. (Phase 1+.)
- **AST:** `@babel/parser` + `recast` (see `docs/decisions/001-ast.md`)
- **Tests:** Vitest
- **Package manager:** pnpm
- **Formatting:** Prettier, applied to the user project's changed nodes only

## Stack (projects Skeleton scaffolds)

Fixed, and can't be configured in v1:
- Vite
- React
- TypeScript
- Tailwind v4 (`@theme`)
- shadcn/ui (curated set)
- React Router

---

## Repo layout

```
/packages
  /core          headless: parser, edit ops, ID system, token writer, analyser
                 pure functions, no Electron or DOM imports (Phase 0 lives here)
  /cli           thin CLI over core for the spike (Phase 0)
  /app-main      Electron main process: fs, git, dev server, AST via core (Phase 1+)
  /app-renderer  React UI: panels, palette, layers (Phase 1+)
  /overlay       script injected into the project webview: selection, gizmos (Phase 2+)
  /templates     project scaffold template, incl. the project CLAUDE.md contract
/fixtures        test projects: base, post-agent snapshots, pathological cases
/docs
  /decisions     ADRs: NNN-title.md
  spike-log.md
  dogfood-log.md
```

### Process boundaries (Phase 1+)
- **Main process:** owns the filesystem, git, child processes and all AST work (calling into `core`).
- **Renderer:** UI only. It never touches the filesystem directly and sends edit intents over IPC.
- **Overlay:** runs inside the user's app. It talks to the host only via `postMessage`, and never imports from `core`.

---

## Coding rules for `core`

- **Edit ops are pure:** `(source: string, op) => { source: string, diff }`. They have no I/O.
- Every edit op has fixture tests asserting all four of the following:
  1. The output parses.
  2. The diff touches only the intended node's lines.
  3. Every pre-existing `data-ui-id` survives.
  4. Code outside the target is byte-identical.
- Add a pathological fixture for every bug found in `spike-log.md` or `dogfood-log.md`, and keep them forever.
- Node classification (`palette` / `primitive` / `plain` / `locked`) must be conservative. **If in doubt, lock it.** A wrongly locked block is an annoyance. A wrongly editable one is data loss.
- No `any`. No silent catches. Errors from edit ops say which node and which op failed.

---

## Workflow

- **Start** each task by stating which TASKS.md item you're working on.
- **Mark** it `[~]` when you begin, and `[x]` only when its tests pass.
- **Keep work small.** One task per commit where practical. Use conventional commit messages (`feat(core): move op preserves locked blocks`).
- **Record decisions** in `docs/decisions/NNN-title.md`. Keep each one short: context, options, decision, consequences.
- **When blocked or unsure** about scope, ask. Don't guess, and don't widen the task.
- **Before declaring a phase done,** run its gate from TASKS.md explicitly and report the result.

## Commands

```
pnpm install
pnpm test            # all packages (Vitest projects)
pnpm test:core       # core fixtures only
pnpm typecheck       # tsc -b across the workspace
pnpm spike <cmd>     # Phase 0 CLI (pnpm spike help)
```
