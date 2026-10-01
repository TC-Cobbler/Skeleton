# ROADMAP — Skeleton (working name)

The roadmap is organised by milestone, not by date. A milestone ships when its gate passes, not on a deadline. Detailed work lives in TASKS.md. This file holds the direction, what's deferred, and why.

---

## v1 — The loop works

**Thesis:** You own the structure and the design system, the agent owns the logic, and code round-trips between you without loss.

| Milestone | Delivers | Gate |
|---|---|---|
| **M0 — Spike** | Headless AST edit ops, ID system, token writer, take-back analyser, round-trip contract | 5 clean manual loops on a fixture project |
| **M1 — Shell** | Electron app, project scaffolder, dev server manager, git service | New project to running app in under 30 s |
| **M2 — Canvas** | Live webview, selection overlay, layers tree, locked blocks, pages, preview widths, light/dark | The post-agent fixture is fully navigable and selectable |
| **M3 — Compose** | Palette (about 20 components plus primitives), auto-layout drag and drop, properties panel, page ops, post-edit build check | Every drop produces one minimal, valid diff |
| **M4 — Gizmos** | On-canvas handles for radius, spacing, type, colour and border width; scope modifiers; violations panel | All three scopes work in light and dark |
| **M5 — Handoff** | Intent notes, Hand off / Take back, `HANDOFF.md`, pass summary, orphan tray, auto-repair, diffs, revert | PRD flows F4 to F6 pass |
| **M6 — Dogfood** | A real personal project built through Skeleton | **5 consecutive clean loops = v1 shipped** |

**Explicitly out of v1:**
- existing codebases and frameworks other than Vite
- absolute positioning
- prototype linking
- an in-app agent runner
- MCP
- collaboration

---

## v1.0.x — Dogfood fixes

**Thesis:** Phase 6 passed its gate: no loop lost code, IDs or tokens. What it did turn up is friction in composing, mostly placing things where you mean (see `docs/dogfood-log.md`, F-1 to F-6). These are fixes to v1's own features, not new scope, so they come before v1.1.

**Done** (T7.1–T7.5, `docs/decisions/012-dogfood-fixes.md`):
- **Drop beside a container, not only into it (F-1, F-4).** Near a container's edge along its parent's flow (8 px, at most a quarter of it), a drop goes before or after it in the parent, never into a locked one. The insertion line is drawn in the parent, and the label says "After Card in Grid".
- **Reorder without seeing both ends (F-2).** Move up / Move down in the Selection panel, and Alt+↑/↓. Both call the same `move` op. Dragging rows in the Layers tree was left out (see ADR 012).
- **Compose inside overlays (F-6).** "Open Dialog in canvas" on a selected Dialog or Sheet clicks its own trigger, so the code doesn't change. While it's open, its content takes drops, selection and edits.
- **No text selection in Skeleton's chrome (F-3).** `user-select: none`, except text fields, code views, the dev-server log and errors.
- **Lighter templates (F-5).** Double-click an element's text on the canvas to edit it in place: one action per text.

---

## v1.1 — Fill the system out

**Thesis:** With the loop proven, make the design system complete and the tool responsive-capable.

- **Shadow / elevation tokens.** Add an elevation scale (`--shadow-1` … `--shadow-5`), a gizmo handle for drag-to-lift, and dark-mode-aware values.
- **Per-breakpoint editing.** Edit at tablet and mobile widths, writing `max-lg:` / `max-md:` / `max-sm:` overrides. The canvas shows which breakpoint "owns" each value.
- **Responsive stacks.** Change a Stack's direction, wrap or Grid column count per breakpoint.
- **Palette expansion.** Move toward the full shadcn set (Accordion, Popover, Tooltip, Command, Calendar, Slider, Radio Group, Breadcrumb, Pagination, Skeleton, Progress, Toggle Group…). Add each component only once its prop schema and round-trip behaviour are tested.
- **Motion tokens.** Duration and easing tokens, plus a gizmo for transition timing.
- **Health metrics.** Show the locked-block ratio per page, the violation count, and the contract breach history across passes.

**Why deferred:** each of these multiplies the surface that round-tripping has to survive. Prove the core first.

---

## v2 — Talk to the agent directly

**Thesis:** Replace file-based handoff with a live, structured channel. Open the tool beyond greenfield.

- **MCP server.** The agent can query layout, tokens, notes and element context live ("what's in `ui_7f3k2`?", "which token drives card radius?"). It can also post replies and request new tokens. `HANDOFF.md` remains as the fallback.
- **Spec-only export.** Export the component tree JSON, the tokens (CSS variables and Tailwind theme) and a generated prompt, for agents or tools without repo access. This was the originally deprioritised option (a).
- **Import existing projects.** Open any project that already uses Vite, React, Tailwind v4 and shadcn. Skeleton infers IDs, maps existing values to tokens, and reports the violations it finds.
- **Prototype linking.** Wire screen-to-screen navigation and dialog triggers on the canvas. The links are written as intent notes or router links.
- **In-app agent runner.** An optional embedded terminal running a configurable command (Claude Code by default). The canvas locks and unlocks automatically, tied to the process state.

---

## v3+ — Only if it becomes a product

These are unscheduled, and only worth doing if v2 proves Skeleton is useful beyond one person.

- Framework support: Next.js App Router first, since it's the most common agent target
- Component library adapters beyond shadcn
- Design system packages: export or import a token and component set as a reusable preset across projects
- Multi-user and collaboration, sync, accounts
- Figma token import
- Tauri port, if a Node-free core becomes feasible

---

## Principles (tie-breakers for roadmap calls)

1. **Round-trip integrity beats features.** A feature that risks losing agent code doesn't ship.
2. **Tokens over overrides.** Every new visual control is token-first, with instance overrides flagged.
3. **The code is the truth.** Never introduce a parallel model that can drift from the source.
4. **Expand only behind a passing gate.** Every addition to the palette, the stack or the scope needs its own round-trip test.
5. **Stay agent-agnostic.** Claude Code is the default, never a hard dependency.
