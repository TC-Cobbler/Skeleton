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
- [x] **T2.2** Overlay script injected into the webview: hover and selection outlines, and a DOM → `data-ui-id` lookup. Communicates with the host via `postMessage`.
- [x] **T2.3** Layers tree panel built from the parser output, with bi-directional selection sync between tree and canvas.
- [x] **T2.4** Locked-block rendering: label (component name or expression type), distinct outline, "view source" popover.
- [x] **T2.5** Page list mirroring the router, including navigate-on-select.
- [x] **T2.6** File watcher: re-parse and reload on external change (unlocked state only).
- [x] **T2.7** Preview widths: desktop / tablet / mobile toggle, plus a side-by-side mode.
- [x] **T2.8** Light/dark toggle, which sets `.dark` on the previewed document.

**Gate 2:** Open the Phase 0 fixture (post-agent) and see every element selectable, locked blocks clearly marked, and the tree matching the canvas.

**Gate 2: passed** (2026-09-30) on both post-agent fixtures (`packages/app-main/e2e/gate2.test.ts`).

- **Tree matches canvas:** every tagged DOM element maps to a tree node, and every rendered node is mapped (loop-01: 69 nodes, 53 on screen; loop-02: 70 nodes, 57 on screen).
- **Locked blocks marked:** all 4 rendered locked blocks on each page are outlined and labelled 🔒.
- **Every ID'd element selectable:** 52 on loop-01 and 55 on loop-02. Most are selected by clicking the canvas; the rest, whose area is covered by children or which have no DOM of their own, are selected from the tree with the canvas outline checked.
- **Caveat, KI-1 (`docs/known-issues.md`):** on a scaled canvas, Chromium occasionally doesn't deliver a click (up to 3 per run, none in most runs). Those elements are selected from the tree and reported.

---

## Phase 3 — Composition

- [x] **T3.1** Palette panel listing the curated components and primitives, each with a typed prop schema and default JSX template.
- [x] **T3.2** Drag from palette onto a stack. The drop indicator is computed from the stack direction and child rects, and the drop calls `insert`.
- [x] **T3.3** Reorder and move within and across stacks (`move`), locked blocks included.
- [x] **T3.4** Delete (`remove`) with confirmation if the node contains locked blocks.
- [x] **T3.5** Properties panel:
  - props from the schema
  - text content
  - Stack properties (direction, gap, padding, align, justify, wrap)
  - Grid properties (columns, gap)
- [x] **T3.6** Page ops: add / rename / delete (writes the route and page file).
- [x] **T3.7** Post-edit pipeline, run on every edit: Prettier → typecheck/build check → auto-rollback plus a toast on failure.
- [x] **T3.8** Undo/redo within a session (an edit-op stack, independent of git).

**Gate 3:** PRD flow F2 passes, with each drop producing one minimal diff and the code valid.

**Gate 3: passed** (2026-09-30) on a newly created project, with the real mouse (`packages/app-main/e2e/gate3.test.ts`). Each drop is one `insert`, checked on its own:

| Drop | Diff | New IDs | Drag to placed, checked and mapped |
|---|---|---|---|
| Stack onto the page | +1 −0, 1 hunk | 1 | ~1.5–2 s (the first edit) |
| Card into the Stack | +12 −1, 2 hunks: the Card, its import, and the empty Stack's tag opened (`/>` → `>`) | 6 | ~1 s |
| Button inside the Card | +2 −0, 2 hunks: the Button and its import | 1 | ~1 s |

- **Minimal:** the only existing line a drop may change is the parent's own tag, and only by opening it. Every other line survives in order.
- **IDs:** every new element has a well-formed `data-ui-id`, unique project-wide, and every existing ID survives.
- **Valid code:** the page parses, and the project's own `tsc -b` passes after every drop. At the end, `pnpm build` (`tsc -b && vite build`) passes.

---

## Phase 4 — Tokens + gizmos

- [x] **T4.1** Token panel with every token, light/dark values side by side, and exact inputs. Derived tokens show their formula, with a detach toggle.
- [x] **T4.2** Token-to-element map: which elements each token affects (for the live count and highlighting).
- [x] **T4.3** Gizmo handles in the overlay:
  - [x] radius corner handle
  - [x] gap handles between siblings
  - [x] padding handles on stack edges
  - [x] type baseline handle (steps through the scale)
  - [x] border-width edge handle
  - [x] colour swatch chip → picker
- [x] **T4.4** Live drag: update CSS variables in the webview during the drag (no file write). Write to disk on release.
- [x] **T4.5** Scope modifiers:
  - plain drag → component token
  - Shift → global token
  - Alt → instance override (arbitrary class)

  A hover label shows the scope before the drag starts.
- [x] **T4.6** Violations panel:
  - list every violation with element, property, value and nearest token
  - actions: snap to token / promote to component token / keep (acknowledged, stored in `/skeleton/config.json`)
- [x] **T4.7** Colour edits target the mode currently shown (light/dark).

**Gate 4:** PRD flow F3 passes in all three scopes, in both light and dark mode.

**Gate 4: passed** (2026-09-30) on a newly created project, with the real mouse, in light and then dark mode (`packages/app-main/e2e/gate4.test.ts`; 6 of 6 consecutive runs). The page has three Buttons, one of them inside a Card. Each drag is on the first Button's radius handle:

| Scope | Live, during the drag | Written on release |
|---|---|---|
| Plain drag | All three Buttons follow (the label says "3 elements"); `globals.css` untouched | One line: `--radius-button: calc(var(--radius) * k)`, still derived from `--radius` |
| Shift | Derived radii follow, the Card's included | One line: `--radius` in `:root`. Buttons and Card come to base × their factor |
| Alt | Only that Button | `rounded-[Npx]` on that Button, one hunk around its element; `globals.css` untouched; the Violations tab shows 1 |

- **Both modes:** the canvas is checked to be in dark mode (`.dark` on the app's `<html>`) for the second pass. The Alt edit is undone between passes, so each starts from the same page.
- **What the gate found (fixed; see ADR 010's amendment):**
  - An Alt radius on a shadcn component lost to its own `rounded-button` once written. The scaffold's `cn` now tells tailwind-merge that named radii are radii.
  - Synthetic pointer moves cancelled gizmo drags.
  - The radius dot moved as the radius changed.
- **Caveat, KI-1 (`docs/known-issues.md`):** a gizmo press lost by Chromium starts no drag and writes nothing. The test retries it (1 retry in 6 runs). The page is written directly rather than built from the palette (Gate 3 covers that): palette drops are flaky in the test harness too (KI-1, and an uninvestigated wrong-entry drop, both in `docs/known-issues.md`).

---

## Phase 5 — Handoff loop

- [x] **T5.1** Intent notes:
  - pin to element
  - types Build / Behaviour / Question
  - canvas pins
  - filter by type and status
  - stored in `/skeleton/notes.json`
- [x] **T5.2** **Hand off** button. It:
  1. validates (no duplicate IDs, build passes)
  2. auto-commits `skeleton: handoff #N`
  3. compiles `HANDOFF.md` (changes since last handoff, tasks, empty replies section)
  4. locks the canvas and shows the "With agent" state
- [x] **T5.3** **Take back** button. It:
  1. auto-commits `agent: pass #N`
  2. re-parses and reloads
  3. parses `HANDOFF.md` ticks and replies back into `notes.json`
  4. runs the take-back analyser (T0.8)
- [x] **T5.4** Pass summary panel showing:
  - files changed
  - elements added / removed / orphaned
  - new violations
  - new locked blocks
  - contract breaches
  - build status
- [x] **T5.5** Orphan tray: re-attach a note to a new element, or discard it.
- [x] **T5.6** Auto-repair on take-back: re-mint duplicate IDs, and assign IDs to un-IDed editable nodes. Report both.
- [x] **T5.7** Per-file diff view (agent pass vs previous handoff).
- [x] **T5.8** **Revert pass**: reset to the previous handoff commit, with confirmation.

**Gate 5:** PRD flows F4, F5 and F6 pass.

**Gate 5: passed** (2026-09-30) on a newly created project, driven through the UI (`packages/app-main/e2e/gate5.test.ts`). The agent's pass is scripted: it writes a hook, an API stub and a `.map` over the data, ticks the task and replies, as Claude Code did in the Phase 0 loops. See ADR 011.

| Flow | What's checked |
|---|---|
| F4 hand off | A Build note is pinned to the Table (from the Notes tab; its pin shows on the canvas). **Hand off** validates (IDs, `pnpm run build`) and commits `skeleton: handoff #1` with a clean tree. `HANDOFF.md` lists `- [ ] ui_tabl0 · Build · Load orders from /api/orders`. The canvas is veiled, Undo is off, and notes can't be added. |
| F5 take back | **Take back** commits `agent: pass #1`. The pass summary says: 1 of 1 tasks done, build passes, 0 breaches, 0 repairs, and the new `.map` locked block. The per-file diff shows the agent's hook call. The canvas renders the fetched rows ("Grace Hopper"), and the `.map` is a 🔒 block in the TableBody. `ui_tabl0` is intact in the code and in the DOM. The note is resolved, and the agent's reply sits under it and on the Table's pin (`✓ ↩`). |
| F6 adjust | `--radius-card` is set in the token panel: one line of `globals.css` changes. The Table is dragged into the other Stack by its selection label. The hook and API files are byte-identical. The page keeps the agent's import and hook call. Every line of the Table's JSX, agent rows included, is unchanged apart from indentation. Outside it, only the emptied `CardContent` changed: it now closes on one line. |

- **Unit and integration coverage:** core `notes`, `handoff` and `repair` tests; `app-main/tests/loop.test.ts`, which runs the whole loop over a real git repo, including refusals, locking, auto-repair, the orphan tray, revert, and state that survives a restart.
- **Full e2e suite:** 89 of 95 pass, Gates 1–5 included. The 6 failures are compose's lost palette drop (KI-1) cascading through the tests after it. That fails at the same rate on the commit before Phase 5 (see `docs/known-issues.md`).
- **What the gate found (fixed; see ADR 011's amendment):**
  - A Table can't be grabbed on the canvas, because its rows cover it. The selected element's label is now a grip for moving it, and the overlay's hit tests look through its own layer.
  - A scripted pass that re-IDs rows is correctly reported as breaking rule 1.

---

## Phase 6 — Dogfood (v1 ship gate)

- [x] **T6.1** Scaffold a real project in Skeleton, e.g. the gaming library app's UI.
- [x] **T6.2** Run 5 consecutive hand off / take back loops with real feature work.
- [x] **T6.3** After each loop, verify and log in `docs/dogfood-log.md`:
  - zero agent-authored logic altered (diff check)
  - 100% ID survival
  - token edits intact
  - build passes
- [x] **T6.4** Triage everything that felt slow or annoying into ROADMAP.md.

**Gate 6 (= v1 done):** 5 consecutive clean loops. Any failure resets the count.

**Gate 6: passed** (2026-09-30). There were 5 consecutive clean loops on a Game Library project scaffolded in Skeleton, with no failures and no resets. See `docs/dogfood-log.md`.

- **The loops:**
  - library grid and search
  - status filter, empty state and badge colours
  - Stats page and navigation
  - Add game dialog with persistence
  - details sheet
- **The user's side:** every edit went through the real UI.
- **The agent's side:** each pass was a fresh headless Claude Code run, prompted only with "Do the tasks in HANDOFF.md."
- **Every loop:**
  - IDs: all survived
  - tokens: every edit intact, and the agent never touched `globals.css`
  - build: passes
  - agent logic: Skeleton's later edits changed no agent-authored line beyond re-indentation and the tags or text targeted in the UI
- **Whole run:** 101 IDs over the project's life and 100 at the end. The one missing is a button deliberately deleted in Skeleton. No duplicates. 0 contract breaches, 0 auto-repairs.
- **Caveat:** the "user" was scripted (`packages/app-main/e2e/dogfood.test.ts`), not a person. The gate proves the loop's integrity. A person using it will find more friction than F-1 to F-6, which are triaged in ROADMAP.md (v1.0.x).

---

## v1.0.x — Dogfood fixes (ROADMAP.md)

Fixes to v1's own features from the dogfood's friction (F-1 to F-6 in `docs/dogfood-log.md`). No new scope.

- [x] **T7.1** Drop beside a container, not only into it (F-1, F-4): near a container's edge along its parent's flow, the drop goes before or after it in the parent.
- [x] **T7.2** Reorder without seeing both ends (F-2): Move up / Move down in the Selection panel (and Alt+↑/↓), through the same `move` op.
- [x] **T7.3** No text selection in Skeleton's chrome (F-3), except text fields, code, the dev-server log and errors.
- [x] **T7.4** Compose inside overlays (F-6): "Open in canvas" on a selected Dialog or Sheet, which clicks its own trigger.
- [x] **T7.5** Lighter templates (F-5): edit an element's text on the canvas with a double-click.

See `docs/decisions/012-dogfood-fixes.md`.

**Gate:** each fix has its tests; the full unit suite and the Gates 1–5 e2e tests still pass.

---

## v1.0.y — UI refresh (docs/ui-refresh-spec.md)

Makes Skeleton's own UI plain-spoken and Adobe-style for someone who doesn't know HTML or CSS. It covers the vocabulary, layout D, the Compact pro dark style and the plain messages. **On-screen presentation only:** no new features, no behaviour changes, and nothing different written into user projects. Every slice keeps the full unit suite and every e2e gate test green, with **the same steps and assertions** (spec §7).

- [~] **T8.1** **Copy files and test helpers: a pure refactor.**
  - Move every on-screen string, unchanged, into the renderer's copy file and the overlay's own copy file.
  - Add the shared e2e helper file of lookups by role and visible name, including the project picker.
  - Switch every e2e and renderer test to the helpers and copy entries.
  - Nothing visible changes.
- [ ] **T8.2** **Plain-words check.**
  - Add a unit test that fails on any glossary *Avoid* word in the copy files, with the allowed exceptions from spec §7.
  - It starts with a **pending list** of today's jargon. Each later slice shrinks the list, and it must be empty by the gate.
- [ ] **T8.3** **Reason codes and the message table.**
  - Core and app-main errors Johnny can meet carry a reason code and facts alongside their unchanged technical message, and IPC passes these through.
  - Add the renderer message table: tier 1 and 2 sentences, plus the catch-all for Skeleton faults.
  - Messages get Details and Copy details, and opening Details stops auto-dismiss.
  - Add the "every code has a sentence" test.
  - Record ADR 013.
- [ ] **T8.4** **Style foundation.**
  - Add the shared style values file (spec §3) and split `styles.css` into area files that use only those values.
  - The overlay injects the values file into its shadow root and drops its hard-coded colours.
  - Set the native window frame to dark.
  - The result is today's layout in Compact pro.
- [ ] **T8.5** **Icons and tooltips.**
  - Add Lucide (1.5px stroke, 20/16px), IconButton (label required) and Tooltip (hover and focus, Escape to close).
  - Remove `title=` throughout.
  - Add the "icon-only buttons use IconButton" test and the tooltip behaviour tests.
  - Add the licence notice in About.
- [ ] **T8.6** **Top bar and status bar** (layout D).
  - Top bar: project name, the page picker (replacing the Pages panel), Undo/Redo, and the ⋯ menu with App preview and its log, Show code and About.
  - Status bar: app state and the workspace's purpose.
- [ ] **T8.7** **Workspaces and inspector** (layout D).
  - Build | Style | Hand off, each with its own left panel.
  - The tabbed inspector (Element / Theme / Off-theme / Agent's work), with each workspace's default tab, and the element's notes at the end of Element.
  - The hand-off bar under the canvas.
  - Navigation goes into the test helpers.
- [ ] **T8.8** **Plain words in the panels.**
  - Use GLOSSARY.md terms throughout, and element names instead of IDs.
  - Use the name tables (spec §6) for theme values, settings and options, agent controls and element parts, each with its fallback rule.
- [ ] **T8.9** **Plain messages.**
  - Write every reason code's sentence to spec §4.
  - Rewrite the empty states, progress lines and confirmations.
  - Disable controls Skeleton knows will be refused, with the same sentence in the tooltip.
- [ ] **T8.10** **Overlay words and colours.**
  - Canvas labels, drop labels, note pins, agent code badges and handle hints in plain words, by element name.
  - The overlay's colours come from the shared values (agent code orange, notes purple, one blue).

**Gate:**
- The plain-words pending list is empty.
- Every reason code has a sentence.
- Every icon-only button uses IconButton and its tooltip shows on hover and on focus.
- The full unit suite and every e2e gate test (gate1–5, dogfood, dogfood-fixes) pass with unchanged steps and assertions.
- Johnny reviews screenshots of each workspace against the approved mocks and signs off.

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
