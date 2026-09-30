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

### Loop 2: status filter, empty state, badge colours (clean)

**Skeleton edits (UI):**
- Set the Grid to 4 columns.
- Grip-moved the Grid, which now holds the agent's `.map`, out of the toolbar; then moved the toolbar up, giving title, toolbar, grid.
- Dropped a Select into the toolbar and set its two items ("All statuses" / all, "Playing" / playing).
- Set the `--primary` token (light).

**Notes:**
- Behaviour on the Select: filter by status, add the other statuses.
- Build on the grid: an empty state.
- Behaviour on the Badge: colour by status with tokens.

**Agent pass:**
- Status state in `useGames()`, combined with the title filter.
- Added 3 SelectItems with new IDs. It changed my `value="playing"` to `"Playing"` to match its type; the ID is kept.
- An empty state (Stack and 2 paragraphs, new IDs) in a conditional inside the grid.
- Badge variants mapped to existing tokens. It asked before adding new hues.

**Take back:** 3 of 3 tasks done. Build passes. 0 breaches, 0 repairs. 6 elements added, 2 new locked blocks (a conditional and a `.map` of options).

| Check | Result |
|---|---|
| IDs | 20/20 survive, 0 duplicates, all well-formed (6 new) |
| Tokens | 2/2 intact; the agent didn't touch `globals.css` |
| Build | passes |
| Agent logic (Skeleton's loop 3 edits) | unchanged. The only agent-authored lines touched are the two I targeted in the UI: the empty-state Stack's opening tag (`py-8` → `py-12`; Prettier reflowed that tag only) and its title text. The conditional around it is byte-identical. |

### Loop 3: Stats page, navigation, edits on agent code (clean)

**Skeleton edits (UI):**
- Home: `py-8` → `py-12` on the agent's empty-state Stack, and its title retitled "Nothing here yet". Both are inside the agent's conditional, edited in place.
- Set the `--primary` dark token.
- Added a Stats page (router and page file) with a 3-column Grid of three stat Cards, retitled.
- The cards first nested into each other (F-4), so I deleted them and dropped them again into the grid's empty columns.

**Notes:**
- Build on the grid: compute the stats.
- Build on the title: navigation between the two pages.

**Agent pass:**
- `useGameStats()` in the hook; the stats render as expressions.
- A `SiteNav` component (new file, IDs on its Buttons) placed on both pages with new IDs.
- Didn't touch the router or `globals.css`.

**Take back:** 2 of 2 tasks done. Build passes. 0 breaches, 0 repairs. 4 elements added. New locked blocks: 2 `SiteNav` (custom component) and 3 expressions.

| Check | Result |
|---|---|
| IDs | 48/48 survive, 0 duplicates, all well-formed (4 new) |
| Tokens | 3/3 intact; the agent didn't touch `globals.css` |
| Build | passes |
| Agent logic (Skeleton's loop 4 edits) | unchanged. The agent-controlled Select (`value`/`onValueChange`) was moved before the search box: re-indented only. The Stats grid's gap change touched only its opening tag. |

## Friction (for T6.4)

- **F-1: A drop meant for "below the toolbar" went inside it.** Aiming at the bottom edge of a horizontal Stack still counts as inside it (the nearest container under the pointer). Dropping *after* a container that's the last child means finding its parent's padding. In loop 1 the Grid ended up in the toolbar, next to the search box, and had to be moved out in loop 2.
- **F-2: Long pages make reordering hard.** With 8 cards in 2 columns, the title and the toolbar couldn't be seen together with the Grid's grip. A move near the frame's top edge autoscrolls (as designed), which shifted the drop to the wrong side of the title. Workaround: make the grid shorter first (4 columns).
- **F-3: Dragging in Skeleton's chrome selects its UI text.** A drag that starts outside the canvas selects headings, buttons and the dev-server log.
- **F-4: A Card dropped "next to" a Card goes inside it.** Card accepts children, so aiming at the right edge of card 1 put card 2 inside card 1 (between its header and content). Card 3 then went inside card 2. Placing sibling cards in a grid means aiming at the grid's empty columns or gaps. Recovery: delete the nested cards (immediate, since there's no agent code in them) and drop again. Same root cause as F-1: a drop always goes into the nearest container under the pointer. Near a container's edge there's no way to say "beside this".
- **F-6: You can't compose inside a closed Dialog.** Its content isn't rendered on the canvas while it's closed, and in select mode clicking the trigger selects it instead of opening it. So there's nowhere to drop a Form into it. The text of its title and description can still be edited from the Layers tree. In loop 4 the form went to the agent as a Build note instead.
- **F-5 (minor): Stat cards come with template text.** Every Card arrives with "Card title / Card description / Card content", which then needs three text edits per card.
