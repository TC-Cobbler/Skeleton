# PRD — Skeleton (working name)

**Status:** Draft v1 · **Owner:** Johnny · **Date:** 2026-09-28

---

## 1. Summary

Skeleton is a desktop app for defining the UI of a React app that is being built with an AI coding agent. You lay out screens by dragging shadcn/ui components into auto-layout stacks, and you tune the design system with on-canvas gizmos (radius, spacing, type, colour). Then you hand the code to an agent to build out. When the agent finishes, you take the code back into Skeleton and adjust it in place. The loop repeats as many times as needed.

The code is always the source of truth. Skeleton never regenerates files. It reads the real project, renders it live, and writes surgical edits back.

## 2. Problem

Building UI with agents fails in two directions:

- **Prompting for UI is lossy.** Describing a layout, spacing rhythm or radius system in prose produces approximate results and slow correction loops.
- **Visual builders don't survive agents.** Tools that generate code from their own internal model either overwrite the agent's work or drift away from it after the first pass.

What's missing is a tool where *you* own structure and design system, the *agent* owns logic, and both can edit the same codebase repeatedly without destroying each other's work.

## 3. Positioning

Onlook (open source, React + Tailwind) already does visual editing of live React code. Skeleton differs in centre of gravity:

| | Onlook | Skeleton |
|---|---|---|
| Starting point | Existing site | Greenfield skeleton |
| Primary object | The page | The design system + the page |
| Styling edits | Per element | Token-first, overrides flagged as violations |
| Agent relationship | AI as an in-app editor | Formal handoff protocol with an external agent |
| Component vocabulary | Anything | Fixed, curated shadcn palette |

Onlook's code-sync approach is worth studying as a reference. Skeleton should not inherit its scope.

## 4. User

Single user: Johnny. The workflow is agent-driven development using PRD.md / ROADMAP.md / CLAUDE.md / TASKS.md per project, with Claude Code as the default agent. v1 is not multi-user, has no accounts, and is not a commercial product. The architecture should not preclude any of those later.

## 5. Goals & non-goals

### Goals (v1)
1. Scaffold a greenfield project on a fixed stack that is round-trip-safe from the first commit.
2. Compose screens visually from a curated component palette using auto-layout.
3. Drive design tokens directly on the canvas through gizmos.
4. Hand off to an agent and take back again with **zero loss** of agent-written logic.
5. Communicate intent to the agent through notes pinned to elements, not freeform prompts.

### Non-goals (v1)
- Importing or editing existing codebases
- Frameworks other than Vite + React (no Next.js, Remix, etc.)
- Free/absolute positioning
- Prototype linking or flows between screens
- Running or orchestrating the agent from inside the app
- MCP server, collaboration, cloud sync

## 6. The core loop

```
Scaffold → Compose + tune → Hand off → [agent works] → Take back → Review diff → Adjust → Hand off → …
```

1. **Scaffold.** Create a new project. Skeleton generates the repo and opens it on the canvas.
2. **Compose and tune.** Drag in components, arrange stacks, pin intent notes and adjust tokens with gizmos.
3. **Hand off.** Skeleton auto-commits, compiles `HANDOFF.md` and locks the canvas.
4. **Agent works.** You run your agent yourself, in your own terminal.
5. **Take back.** You press "Take back". Skeleton auto-commits the agent's work, re-parses the code, reloads the canvas and shows a diff.
6. **Review.** Agent replies appear pinned to their elements, and orphans and violations are surfaced.
7. **Repeat.**

## 7. Architecture

### 7.1 Shell
- **Electron.** Code parsing (AST), the dev server and file watching are all Node. With Tauri, all of that would have to run in a separate Node sidecar process, so Tauri's size advantage wouldn't materialise.
- The app UI is React. It runs in its own renderer, which is separate from the project being edited.

### 7.2 Canvas rendering
- Skeleton spawns the project's own Vite dev server and renders it in an embedded webview.
- A selection overlay is injected into the webview. It maps DOM nodes to their source using `data-ui-id`.
- What you see is what the agent built, custom components included.

### 7.3 Source of truth and editing
- **The code is the only source of truth.** Skeleton holds no persistent parallel model of the layout. Its internal tree is derived by parsing the code and discarded whenever the code changes.
- **Edits are surgical AST patches** (Babel or ts-morph) that preserve formatting and comments. A file is never regenerated wholesale.
- Every edit Skeleton makes is a minimal, reviewable diff.

### 7.4 Parsing and locked blocks
- Recognised JSX (palette components, layout primitives and plain elements carrying a `data-ui-id`) is fully editable.
- Anything else becomes a **locked block**: custom components, conditionals, `.map()` loops, and anything carrying hooks or logic. A locked block is visible, selectable and movable as a unit within its parent stack, but its internals can't be edited.
- A locked block shows a label (component name or expression type) and a "view source" affordance.

### 7.5 File watching
- While the canvas is unlocked, external file changes (e.g. manual edits) trigger a re-parse and hot reload.
- While the canvas is locked, changes are ignored until "Take back".

## 8. Scaffolded stack

Fixed. It can't be configured in v1.

- Vite + React + TypeScript
- Tailwind CSS v4 (`@theme` tokens)
- shadcn/ui (the curated component set, copied in)
- React Router (one route = one page on the canvas)
- Git initialised, with an initial commit
- Generated docs: `PRD.md`, `ROADMAP.md`, `CLAUDE.md` (including the round-trip contract, §13), `TASKS.md`, `HANDOFF.md`

### Project layout
```
/src
  /components/ui      shadcn components (curated)
  /components/layout  Stack, Grid, Container, Spacer
  /pages              one file per route
  /styles/globals.css @theme tokens (light + dark)
  router.tsx
/skeleton
  config.json         project metadata, token schema version
  notes.json          intent notes + agent replies, keyed by data-ui-id
CLAUDE.md
HANDOFF.md
```

## 9. Canvas and composition

### 9.1 Palette (v1: about 20 components + primitives)
- **Layout primitives:** Stack (horizontal/vertical), Grid, Container, Spacer
- **Inputs:** Button, Input, Textarea, Select, Checkbox, Switch, Form
- **Display:** Card, Badge, Avatar, Table, Tabs, Separator
- **Overlay:** Dialog, Sheet, Dropdown Menu, Toast
- **Navigation:** Sidebar/Nav
- **Agent-built custom components:** appear as locked blocks and can be placed and moved.

The palette only expands once round-tripping is proven (see §15).

### 9.2 Layout model
- **Auto-layout only.** Every element lives inside a flex Stack or a Grid.
- Dropping a component inserts it at an index within a stack. The drop indicator shows the insertion point.
- Reordering works by dragging within or between stacks.
- Stack properties: direction, gap, padding, alignment and justification, wrap.
- Grid properties: column count, gap.
- No absolute positioning, anywhere.

### 9.3 Properties panel
- Component props, taken from a typed schema per palette component (e.g. Button `variant`, `size`)
- Text content
- Layout properties when a Stack or Grid is selected
- Token bindings, showing which token drives each visual property

### 9.4 Pages
- A page list mirrors the React Router routes.
- Add, rename and delete pages. Each operation writes the route and page file.
- Opening a page shows it on the canvas.

## 10. Gizmos and tokens

### 10.1 Token set (v1)
| Token | Structure |
|---|---|
| Radius | `--radius` base, plus per-component `--radius-button`, `--radius-card`, `--radius-input`, `--radius-dialog`, … each derived from the base by default (e.g. `calc(var(--radius) * 0.75)`) and detachable |
| Spacing | Base unit (`--spacing`), which drives the Tailwind spacing scale |
| Type scale | Base size + ratio → `--text-xs` … `--text-4xl`; font family tokens (sans, mono) |
| Colour | shadcn semantic set (background, foreground, primary, secondary, muted, accent, destructive, border, ring, …), each with a light and a dark value |
| Border width | `--border-width` default |

Shadows/elevation are deferred to v1.1.

### 10.2 Gizmo interaction
Handles drawn on the canvas are the primary control:

- **Radius:** a corner handle on the selected element. Drag it to change the radius.
- **Spacing:** gap handles between siblings in a stack, and padding handles on a stack's inner edges.
- **Type:** a baseline handle on text. Drag vertically to change the size step.
- **Colour:** a swatch chip on the selection that opens a picker.
- **Border width:** an edge handle.

The side panel mirrors every handle with exact numeric inputs.

Live feedback: while you drag, every element affected by the token updates in real time, and a count shows how many elements are affected.

### 10.3 Scope modifiers
| Gesture | Scope | Writes to |
|---|---|---|
| Plain drag | Component token (e.g. all Buttons) | `--radius-button` in `globals.css` |
| **Shift** + drag | Global token | `--radius` base (derived tokens follow) |
| **Alt** + drag | This instance only | Arbitrary Tailwind class on the element, e.g. `rounded-[14px]` |

A hover label shows the current scope before you commit the drag.

### 10.4 Violations
- Any instance override (an arbitrary value or a hard-coded colour) is a **violation**.
- The violations panel lists every one: element, property, value, and the nearest existing token.
- Actions available for each violation:
  - **Snap to token:** replace the override with the nearest existing token.
  - **Promote to token:** create a new component token from the override value.
  - **Keep:** acknowledge the override and leave it.
- Violations the agent introduces are caught the same way on "Take back".

### 10.5 Dark mode
- A canvas toggle switches the project between light and dark (the `.dark` class).
- Colour gizmos edit the value for the mode currently shown.
- The token panel shows the light and dark values side by side.

### 10.6 Responsive
- Three preview widths are available: desktop, tablet and mobile. Previews can be shown side by side or switched between.
- **v1 edits at the desktop base only.** Tailwind is mobile-first, so a desktop-first workflow means:
  - Base classes express the desktop layout.
  - Smaller breakpoints use `max-lg:` / `max-md:` / `max-sm:` variants.
- v1 preserves and displays responsive classes written by the agent (or by hand) but doesn't edit them.
- Per-breakpoint editing is deferred to v1.1.

## 11. Element identity

- Every element Skeleton places gets a `data-ui-id` (short, stable, unique per project, e.g. `ui_7f3k2`).
- IDs are how the canvas, notes, diffs and gizmos all refer to an element.
- The round-trip contract (§13) requires the agent to preserve existing IDs and mint new ones in the same format for any element it adds.
- On "Take back":
  - IDs that no longer exist in the code are marked **orphans**. Their notes are shown in an orphan tray, where you can re-attach or discard them.
  - Elements without an ID that the parser can edit are auto-assigned one and reported.
  - Duplicate IDs are flagged and resolved by re-minting.

## 12. Intent notes and handoff

### 12.1 Intent notes
- A note is pinned to any element and stored in `/skeleton/notes.json`, keyed by `data-ui-id`.
- Note types: **Build** (e.g. "load orders from `/api/orders`"), **Behaviour** (e.g. "opens checkout dialog"), **Question**.
- Notes are visible as pins on the canvas and can be filtered by type or status.

### 12.2 Hand off
Pressing **Hand off**:
1. Validates: no unresolved duplicate IDs, and the project builds.
2. Auto-commits with the message `skeleton: handoff #N`.
3. Compiles `HANDOFF.md`.
4. Locks the canvas and shows a "With agent" state.

**`HANDOFF.md` format**
```md
# Handoff #N — 2026-09-28 23:50

## Changes since last handoff
- Added pages: /orders
- Token changes: --radius-card 12px → 16px
- New elements: ui_7f3k2 (Table in OrdersPage), …

## Tasks
- [ ] ui_7f3k2 · Build · Load orders from /api/orders; paginate 20/page
- [ ] ui_a91xq · Behaviour · Opens CheckoutDialog (ui_c02mm)
- [ ] ui_b44pd · Question · Should empty state show a CTA?

## Agent replies
<!-- Agent: tick tasks above and add replies here, keyed by data-ui-id -->
```

### 12.3 Take back
Pressing **Take back**:
1. Auto-commits the agent's work with the message `agent: pass #N`.
2. Re-parses the whole project and reloads the canvas.
3. Reads `HANDOFF.md`:
   - Ticked tasks mark their notes resolved.
   - Replies are re-pinned to their elements.
4. Opens a **pass summary** showing:
   - The files changed
   - Elements added, removed and orphaned
   - New violations
   - New locked blocks
   - Build status
5. Offers a per-file diff view (agent pass vs previous handoff).

The git history gives free undo across the whole loop. **Revert pass** restores the previous handoff commit.

## 13. Round-trip contract (CLAUDE.md section)

Skeleton writes this section into `CLAUDE.md` and keeps it current. It is a product component, not documentation, and round-tripping depends on the agent following it.

1. **Never remove or change a `data-ui-id`.** Give every new JSX element you create an ID in the format `ui_xxxxx` (5 lowercase alphanumerics, unique within the project).
2. **Style only with tokens.** Use Tailwind classes that map to `@theme` tokens. No inline `style`, no arbitrary values (`[...]`), and no hard-coded colours.
3. **Don't edit `globals.css` tokens.** Token values are owned by Skeleton. If you need a new token, request it in `HANDOFF.md`.
4. **Keep layout in primitives.** Use Stack / Grid / Container for layout rather than ad-hoc flex `div`s.
5. **Isolate logic.** Put data fetching, state and effects in hooks or wrapper components, not inline in page layout JSX, wherever practical.
6. **Don't restructure the scaffold.** Keep the file layout, router file and `/skeleton` folder as they are.
7. **Report back.** Tick completed tasks in `HANDOFF.md` and add replies keyed by `data-ui-id`.

Contract breaches are detected on "Take back" and shown in the pass summary.

## 14. Key flows (acceptance-level)

**F1 — Scaffold.** New project → name → repo created, dev server running, empty home page on the canvas within 30 s.

**F2 — Compose.**
- Drag a Stack onto the page, then drop in a Card, then a Button inside the Card.
- Each drop produces a single minimal AST edit.
- The code is valid and the element appears in the page's source with a `data-ui-id`.

**F3 — Tune.**
- Plain-drag the radius handle on a Button: every Button updates live and `--radius-button` changes in `globals.css`.
- Shift-drag instead: the base `--radius` changes, and all derived component radii follow.
- Alt-drag instead: only that Button changes and a violation appears.

**F4 — Hand off.** Pin a Build note on the Table → Hand off → commit created, `HANDOFF.md` lists the task, canvas locked.

**F5 — Take back.** The agent implements data fetching and ticks the task.
- Take back → canvas shows the Table rendering live data.
- The data-bearing part appears as a locked block.
- The note is resolved and the agent's reply is pinned.
- The Table's `data-ui-id` is intact.

**F6 — Adjust after the agent.**
- Change `--radius-card` and move the Table to a different Stack.
- The agent's hooks and logic are byte-identical after the edit, apart from the moved JSX.

## 15. Success criteria (v1 done)

Dogfooded on a real personal project, v1 is done when **5 consecutive round trips** meet all of the following:
- **Zero loss** of agent-written logic. Verified by diff: no agent-authored line is removed or altered except by an explicit user action.
- **100% `data-ui-id` survival** for elements that still exist.
- **Token integrity.** Every token edit made in Skeleton is present and effective after the agent's pass.
- The project builds after every take-back.

Any single failure means it doesn't ship.

## 16. Risks

| Risk | Mitigation |
|---|---|
| The agent ignores the contract (strips IDs, uses inline styles) | Contract in CLAUDE.md, breaches surfaced on take-back, auto-repair where safe (re-mint IDs), git revert |
| AST edits corrupt formatting or logic | Patches are limited to JSX structure and className, run Prettier afterwards, add a build check after each edit and roll back on failure |
| Too much of the page becomes locked blocks | Contract rule 5 (isolate logic). Track the locked-block ratio per page as a health metric |
| The dev server is slow or flaky in the webview | Reuse a single persistent server and keep HMR on. Only restart on dependency change |
| Scope creep toward "general visual editor" | Hold the non-goals. The palette only expands after §15 passes |

## 17. Roadmap

**v1** — everything above.

**v1.1**
- Shadow/elevation tokens
- Per-breakpoint editing (`max-*:` overrides from the canvas)
- Palette expansion toward the full shadcn set
- Stack/Grid responsive direction changes

**v2**
- MCP server, so the agent can query layout, tokens and notes live instead of via files
- Spec-only export (component tree JSON + tokens + prompt) for agents without repo access
- Importing existing Vite + React + Tailwind + shadcn projects
- Prototype linking between screens
- Optional in-app agent runner (configurable command)
