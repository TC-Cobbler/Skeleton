# Audit (2026-10-15)

An adoption audit of Skeleton at `757b827`, after the v1.0.y gate. Scope agreed with Johnny: audit, then plan v1.1. The repo keeps its own layout and conventions (`docs/decisions/`, phase-based TASKS.md, parking in ROADMAP.md), and no harness changes were made.

## What it is

An Electron desktop app for laying out and styling the UI of a React app while an AI coding agent writes its logic. You create a project from a fixed scaffold (Vite, React, TS, Tailwind v4, shadcn/ui, React Router) and build pages by dragging elements onto a live canvas of the real app. You tune the theme with a panel and with handles on the canvas, and pin notes for the agent. Then you hand off (commit plus `HANDOFF.md`). The agent works in your own terminal, and you take the project back to review what changed. Every edit is a minimal AST patch to the real files, and the loop's state comes from git commit subjects.

## Stack

- **Skeleton itself:** TypeScript 5 (strict), Electron (main + preload + renderer), React (renderer), `@babel/parser` + `recast` (ADR 001), Prettier on changed nodes, Vitest 3 (unit and e2e projects), Playwright-driven Electron for e2e, pnpm 10 workspaces, Node 22.13+ or 24+, Lucide icons.
- **Projects it scaffolds:** Vite, React, TypeScript, Tailwind v4 (`@theme`), shadcn/ui new-york-v4 (vendored, `packages/templates/VENDORED.md`), React Router, sonner.
- **Storage:** none of its own. The user's files, git, `skeleton/config.json` and `skeleton/notes.json` in the project.
- **Packaging:** none yet. It runs from source (`pnpm dev`, `pnpm start`).

## Map

| Package | Lines (src) | Test files | What it does |
|---|---|---|---|
| `core` | ~3,900 | 17 | Pure parser, edit ops, IDs, token writer, analyser, violations, handoff, repair, reason codes |
| `app-main` | ~4,100 | 29 (incl. 12 e2e) | Electron main: files, git, dev server, editor queue, IPC, loop (Hand off / Take back) |
| `app-renderer` | ~5,500 | 15 | React UI: workspaces, inspector, panels, canvas host, copy file, plain names, messages |
| `overlay` | ~2,400 | 6 | Injected into the user's app: mapping, selection, drop targets, gizmos |
| `templates` | ~3,400 | 6 | Project scaffold, vendored shadcn, palette catalogue and schemas |
| `cli` | ~340 | 0 | The Phase 0 spike CLI over core |

`fixtures/` holds `base`, the post-agent snapshots and 4 pathological cases.

## Features

All checked by the e2e suite in the built Electron app (Xvfb), not just by reading the code.

| Feature | Status | Evidence |
|---|---|---|
| New project (scaffold, git, dev server, page on the canvas) | works | `gate1`, `devserver` |
| Canvas: live app, selection, layers, agent code locked, pages, preview widths, light/dark | works | `gate2`, `canvas` |
| Compose: palette (all of PRD §9.1), drops in and beside, move, remove, settings, text, page ops, build check | works | `gate3`, `compose`, `dogfood-fixes` |
| Theme panel, handles with three scopes, colour picker, off-theme list (snap, promote, keep) | works | `gate4`, `tokens` |
| Notes, Hand off, Take back, review, missing-element tray, auto-repair, diffs, revert | works | `gate5` |
| Open Dialog/Sheet in the canvas, Move up/down, edit text in place | works | `dogfood-fixes` |
| Plain words, layout D, plain messages | works | unit (`plain-words`, `messages`, `icon-buttons`, `tooltip`), Johnny's sign-off |
| Toast palette entry | works as designed | Listed but can't be placed: toasts are fired by code (ADR 007) |
| Form palette entry | works as designed | A plain `<form>` of labelled fields, not shadcn's react-hook-form `Form` (ADR 007) |

No feature is **broken**, **partial** or a **stub**.

**Runs today:**
- `pnpm install`, `pnpm typecheck`: clean.
- `pnpm test`: 448 of 448 in 49 files.
- `xvfb-run -a pnpm test:e2e`: 103 of 104 pass, and `dogfood.test.ts` is skipped (it's step-driven). The one failure, Gate 4's "F3 in dark mode, plain drag", had no handle label mid-drag. The file then passed 8 of 8, three times, on its own. This is KI-3 (it already lists this same test).

## Docs vs reality

1. **PRD.md is still "Draft v1" (2026-09-28),** and its §17 roadmap is the original v1.1 list. ROADMAP.md is the live one. *Fixed in this audit:* the status line now says shipped, and §17 points to ROADMAP.md.
2. **PRD §15 says v1 was dogfooded "on a real personal project".** It was a real project, but the user was a script (TASKS.md Phase 6 caveat), and Johnny hasn't built anything by hand yet. *Fixed:* §15 notes the caveat, and v1.1 now starts with a hand dogfood (M7).
3. **PRD §7.3 says "Babel or ts-morph".** ADR 001 chose `@babel/parser` + `recast`. *Fixed.*
4. **PRD §9.1 lists Form and Toast** as plain palette components. They're special cases (ADR 007). *Fixed:* a pointer to ADR 007.
5. **ROADMAP v1.1 had six features,** including per-breakpoint editing, which alone is larger than the rest. *Re-scoped* with Johnny: see ROADMAP.md v1.1 and v1.2.
6. **TASKS.md "Parked"** still listed v1.1 items. *Updated.*
7. **`COMMANDS.md`** is one line that repeats README's `pnpm dev`. It's harmless, so it was left alone. It could be removed.
8. **`.scratch/ui-refresh/`** (inventory, issue drafts, prototypes, a reference image) is committed working material from v1.0.y, which is done. Candidate to delete or move under `docs/archive/`. It was left alone.

## Health

- **Tests:** strong on the core path. Every edit op has fixture tests asserting the four properties (CLAUDE.md), every gate has an e2e test, and there's a plain-words check, a reason-code coverage test and a palette typecheck test. `cli` has none (spike only, acceptable).
- **Flakes:** KI-3 is open. Canvas presses right after an edit are occasionally missed in full e2e runs (seen again today, in `gate4`). KI-1 §3 has two unreproduced reports. → T9.3.
- **No CI.** There's no `.github/workflows`, so the unit and e2e suites run only when someone runs them. Candidate: a workflow for `pnpm typecheck && pnpm test` (e2e under Xvfb is slower and flakier, so it could be optional). Not added; ask first.
- **No linter or pre-commit hook.** `.prettierrc.json` exists for the scaffolded projects' changed nodes. Skeleton's own code isn't linted. Low risk given strict TS and the test density.
- **Known limitations (ADR 010 amendment):** projects scaffolded before the `cn` fix keep the old tailwind-merge config, so an instance radius can lose to the component token. Promoted `--text-*` names are read as colours by tailwind-merge.
- **No packaging.** There's no installer or packaged app. Fine for a single user running from source, and it's not in v1's scope.
- **Dead code:** none found. There are no TODO/FIXME markers in `packages/*/src`.
