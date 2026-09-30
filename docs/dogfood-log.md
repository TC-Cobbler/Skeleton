# Dogfood log (Phase 6)

Gate 6: 5 consecutive clean hand off / take back loops with real feature work. Any failure resets the count.

## Setup

- **Project:** "Game Library", a UI for a personal game collection. Scaffolded with Skeleton's own New project flow into `/home/user/dogfood/game-library` (outside the repo).
- **The user (Skeleton's side):** every edit goes through Skeleton's real UI in the built Electron app: palette drags, grip moves, the properties panel, the token panel, pages, notes, Hand off and Take back. It's driven with the real mouse by `packages/app-main/e2e/dogfood.test.ts`, one step per run (`DOGFOOD_STEP=loopN`, then `takebackN`). The app is relaunched for each step, as a user reopens a project.
- **The agent:** a fresh headless Claude Code run in the project folder for each pass, prompted only with "Do the tasks in HANDOFF.md." It knows only the project's own `CLAUDE.md` contract. Skeleton isn't mentioned, and nothing says it's a test.
- **Checks (T6.3):** `verify.mjs` (kept with the project) uses git, regexes and a build, not Skeleton's analyser.
  - After take back N, `verify pass N` checks:
    - every ID from handoff N survives
    - no ID is duplicated, and every ID is well-formed
    - every token Skeleton set is still in `globals.css`, and the agent didn't touch that file
    - `pnpm run build` passes
  - After handoff N+1, `verify edits N` checks that Skeleton's edits since pass N changed no agent-authored line beyond re-indenting it, apart from the opening tags Skeleton targeted.

A loop is clean when all four checks pass and Skeleton needed no workaround outside its UI.

## Loops

### Loop 1: library grid, search, a Question (clean)

**Skeleton edits (UI):**
- Retitled the page.
- Dropped a horizontal Stack (toolbar) with an Input and a Button ("Add game", Justify: space between).
- Dropped a Grid with a Card template (title, description, content, Badge).
- Set the `--radius` token (0.625rem → 0.75rem).

**Notes:**
- Build on the grid: 8 mock games, one card each.
- Behaviour on the Input: filter by title.
- Question on "Add game": which fields?

**Agent pass:**
- Added `src/hooks/use-games.ts` (mock data and a filter) and turned the Card into a `.map` template, keeping every ID.
- Bound the Input.
- Ticked all 3 tasks and answered the Question (title, platform, status, hours).

**Take back:** 3 of 3 tasks done. Build passes. 0 breaches, 0 repairs, 5 new locked blocks (the `.map` and 4 data expressions).

| Check | Result |
|---|---|
| IDs | 14/14 survive, 0 duplicates, all well-formed |
| Tokens | 1/1 intact; the agent didn't touch `globals.css` |
| Build | passes |
| Agent logic (Skeleton's loop 2 edits) | unchanged: the Grid with the agent's `.map` was moved twice, byte-for-byte except indentation; the column change touched only its opening tag |

## Friction (for T6.4)

- **F-1: A drop meant for "below the toolbar" went inside it.** Aiming at the bottom edge of a horizontal Stack still counts as inside it (the nearest container under the pointer). Dropping *after* a container that's the last child means finding its parent's padding. In loop 1 the Grid ended up in the toolbar, next to the search box, and had to be moved out in loop 2.
- **F-2: Long pages make reordering hard.** With 8 cards in 2 columns, the title and the toolbar couldn't be seen together with the Grid's grip. A move near the frame's top edge autoscrolls (as designed), which shifted the drop to the wrong side of the title. Workaround: make the grid shorter first (4 columns).
- **F-3: Dragging in Skeleton's chrome selects its UI text.** A drag that starts outside the canvas selects headings, buttons and the dev-server log.
