# TASKS — Skeleton (working name)

Ordered by risk. The riskiest thing is round-trip integrity (AST edits surviving an agent's pass), so it is proven headless before any canvas UI exists. Each phase has an exit gate, and nothing moves forward until the gate passes.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · **Gate** = phase exit criteria

---

## Phase 0 — Round-trip spike (headless, no UI)

Goal: prove the code can round-trip before building anything around it. This phase is CLI only.

- [x] **T0.1** Hand-scaffold a fixture project: Vite + React + TS + Tailwind v4 + shadcn (Button, Card, Table only) + Stack primitive. Commit it as `fixtures/base`.
- [x] **T0.2** Pick the AST library. Build the same edit (insert a JSX child at an index) twice, once with Babel (`@babel/parser` + `recast`) and once with ts-morph. Compare on:
  - formatting and comment preservation
  - TS generics / type annotations surviving
  - diff size

  Record the choice in `docs/decisions/001-ast.md`.
- [x] **T0.3** Parser: page file → element tree, keyed by `data-ui-id`. Classify each node as one of:
  - `palette`
  - `primitive`
  - `plain` (element with ID)
  - `locked` (custom component, `.map`, conditional, spread props)

  Logic-bearing props are protected rather than locking the element, and elements wrapped by locked blocks stay editable in place: see `docs/decisions/002-editability.md`.
- [x] **T0.4** Edit ops as pure functions (`source in → source out`). Each must produce a minimal diff:
  - [x] `insert(parentId, index, node)`
  - [x] `move(id, newParentId, index)` (locked blocks included)
  - [x] `remove(id)`
  - [x] `setProp(id, key, value)`
  - [x] `setClass(id, add[], remove[])`
- [x] **T0.5** ID minting: `ui_` + 5 lowercase alphanumerics, unique within the project. Build a project-wide ID index.
- [x] **T0.6** Token writer: read and write `@theme` variables in `globals.css`, covering both light and `.dark` blocks. Must not touch anything else in the file.
- [x] **T0.7** Write the round-trip contract text (PRD §13) as `CLAUDE.md` in the fixture.
- [x] **T0.8** Take-back analyser: given a before/after commit pair, report:
  - orphaned IDs
  - duplicate IDs
  - new un-IDed editable nodes
  - new violations (arbitrary values, inline styles, hard-coded colours)
  - new locked blocks
  - token file tampering
- [x] **T0.9** **Manual loop test.** On the fixture, run 5 rounds of the following:
  1. Apply scripted edits via the CLI.
  2. Write a handoff task.
  3. Run Claude Code with a real task (fetch data into the Table, add a dialog, etc.).
  4. Run the analyser.
  5. Apply more edits on top of the agent's code.

  Log every failure in `docs/spike-log.md`.
- [x] **T0.10** Fix or tighten based on the log. This may mean new contract rules, more conservative edit ops, or auto-repair (re-minting IDs).

**Gate 0:** 5 consecutive loops on the fixture with:
- zero agent-authored lines altered by edit ops
- 100% ID survival
- tokens intact
- a build passing after each step

If this can't be reached, stop and rethink the architecture before touching UI.

**Gate 0: passed** (2026-09-30). 5/5 consecutive clean loops, logged in `docs/spike-log.md` (loop 2); artefacts in `fixtures/post-agent/loop-02`.

---

## Phase 1 — Shell + scaffold

- [x] **T1.1** Electron app skeleton (React renderer, main process for fs/git/child processes). Set up IPC boundaries: the main process owns the filesystem, git and AST; the renderer owns the UI.
- [x] **T1.2** Project scaffolder, turning the fixture into a template. It generates:
  - the stack, the curated shadcn set (about 20) and the layout primitives
  - React Router with a home page
  - `globals.css` with the full v1 token set (radius base plus per-component derived tokens, spacing, type scale, colour light/dark, border width)
  - `/skeleton/config.json` and `/skeleton/notes.json`
  - `PRD.md`, `ROADMAP.md`, `CLAUDE.md` (contract), `TASKS.md`, `HANDOFF.md`
  - `git init` plus an initial commit
- [x] **T1.3** Dev server manager: spawn Vite per project, detect its port, restart only on dependency change, surface logs and errors in a panel.
- [x] **T1.4** Project picker: new / open recent.
- [x] **T1.5** Git service: commit with message, diff between commits, revert to commit.

**Gate 1:** New project to running app on screen in under 30 s (PRD F1).

**Gate 1: passed** (2026-09-30). From clicking **Create project** in the Electron app to the new app's home page rendering its heading: 4.6 s with a warm pnpm store, 6.2 s with an empty one (126 packages downloaded), first measured in a second window. Since T2.1 it is measured on the canvas itself: 8.7 s with the full e2e suite running in parallel. Benchmark: `packages/app-main/e2e/gate1.test.ts` (`GATE1_COLD=1` for an empty store).

---

## Phase 2 — Canvas (read-only)

- [x] **T2.1** Embedded webview pointing at the dev server.
- [ ] **T2.2** Overlay script injected into the webview: hover and selection outlines, and a DOM → `data-ui-id` lookup. Communicates with the host via `postMessage`.
- [ ] **T2.3** Layers tree panel built from the parser output, with bi-directional selection sync between tree and canvas.
- [ ] **T2.4** Locked-block rendering: label (component name or expression type), distinct outline, "view source" popover.
- [ ] **T2.5** Page list mirroring the router, including navigate-on-select.
- [ ] **T2.6** File watcher: re-parse and reload on external change (unlocked state only).
- [ ] **T2.7** Preview widths: desktop / tablet / mobile toggle, plus a side-by-side mode.
- [ ] **T2.8** Light/dark toggle, which sets `.dark` on the previewed document.

**Gate 2:** Open the Phase 0 fixture (post-agent) and see every element selectable, locked blocks clearly marked, and the tree matching the canvas.

---

## Phase 3 — Composition

- [ ] **T3.1** Palette panel listing the curated components and primitives, each with a typed prop schema and default JSX template.
- [ ] **T3.2** Drag from palette onto a stack. The drop indicator is computed from the stack direction and child rects, and the drop calls `insert`.
- [ ] **T3.3** Reorder and move within and across stacks (`move`), locked blocks included.
- [ ] **T3.4** Delete (`remove`) with confirmation if the node contains locked blocks.
- [ ] **T3.5** Properties panel:
  - props from the schema
  - text content
  - Stack properties (direction, gap, padding, align, justify, wrap)
  - Grid properties (columns, gap)
- [ ] **T3.6** Page ops: add / rename / delete (writes the route and page file).
- [ ] **T3.7** Post-edit pipeline, run on every edit: Prettier → typecheck/build check → auto-rollback plus a toast on failure.
- [ ] **T3.8** Undo/redo within a session (an edit-op stack, independent of git).

**Gate 3:** PRD flow F2 passes, with each drop producing one minimal diff and the code valid.

---

## Phase 4 — Tokens + gizmos

- [ ] **T4.1** Token panel with every token, light/dark values side by side, and exact inputs. Derived tokens show their formula, with a detach toggle.
- [ ] **T4.2** Token-to-element map: which elements each token affects (for the live count and highlighting).
- [ ] **T4.3** Gizmo handles in the overlay:
  - [ ] radius corner handle
  - [ ] gap handles between siblings
  - [ ] padding handles on stack edges
  - [ ] type baseline handle (steps through the scale)
  - [ ] border-width edge handle
  - [ ] colour swatch chip → picker
- [ ] **T4.4** Live drag: update CSS variables in the webview during the drag (no file write). Write to disk on release.
- [ ] **T4.5** Scope modifiers:
  - plain drag → component token
  - Shift → global token
  - Alt → instance override (arbitrary class)

  A hover label shows the scope before the drag starts.
- [ ] **T4.6** Violations panel:
  - list every violation with element, property, value and nearest token
  - actions: snap to token / promote to component token / keep (acknowledged, stored in `/skeleton/config.json`)
- [ ] **T4.7** Colour edits target the mode currently shown (light/dark).

**Gate 4:** PRD flow F3 passes in all three scopes, in both light and dark mode.

---

## Phase 5 — Handoff loop

- [ ] **T5.1** Intent notes:
  - pin to element
  - types Build / Behaviour / Question
  - canvas pins
  - filter by type and status
  - stored in `/skeleton/notes.json`
- [ ] **T5.2** **Hand off** button. It:
  1. validates (no duplicate IDs, build passes)
  2. auto-commits `skeleton: handoff #N`
  3. compiles `HANDOFF.md` (changes since last handoff, tasks, empty replies section)
  4. locks the canvas and shows the "With agent" state
- [ ] **T5.3** **Take back** button. It:
  1. auto-commits `agent: pass #N`
  2. re-parses and reloads
  3. parses `HANDOFF.md` ticks and replies back into `notes.json`
  4. runs the take-back analyser (T0.8)
- [ ] **T5.4** Pass summary panel showing:
  - files changed
  - elements added / removed / orphaned
  - new violations
  - new locked blocks
  - contract breaches
  - build status
- [ ] **T5.5** Orphan tray: re-attach a note to a new element, or discard it.
- [ ] **T5.6** Auto-repair on take-back: re-mint duplicate IDs, and assign IDs to un-IDed editable nodes. Report both.
- [ ] **T5.7** Per-file diff view (agent pass vs previous handoff).
- [ ] **T5.8** **Revert pass**: reset to the previous handoff commit, with confirmation.

**Gate 5:** PRD flows F4, F5 and F6 pass.

---

## Phase 6 — Dogfood (v1 ship gate)

- [ ] **T6.1** Scaffold a real project in Skeleton, e.g. the gaming library app's UI.
- [ ] **T6.2** Run 5 consecutive hand off / take back loops with real feature work.
- [ ] **T6.3** After each loop, verify and log in `docs/dogfood-log.md`:
  - zero agent-authored logic altered (diff check)
  - 100% ID survival
  - token edits intact
  - build passes
- [ ] **T6.4** Triage everything that felt slow or annoying into ROADMAP.md.

**Gate 6 (= v1 done):** 5 consecutive clean loops. Any failure resets the count.

---

## Parked (see ROADMAP.md)

- Shadow / elevation tokens (v1.1)
- Per-breakpoint editing via `max-*:` (v1.1)
- Palette expansion toward the full shadcn set (v1.1)
- MCP server (v2)
- Spec-only export (v2)
- Import existing projects (v2)
- Prototype linking (v2)
- In-app agent runner (v2)
