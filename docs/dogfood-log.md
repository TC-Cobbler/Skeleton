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

### Loop 4: Add game dialog, persistence (clean)

**Skeleton edits (UI):**
- Grip-moved the agent-controlled Select before the search box.
- Stats grid gap `gap-4` → `gap-6`.
- Dropped a Dialog into the toolbar. Set its trigger text ("Add game") and variant, its title and its description.
- Deleted the loop 1 placeholder "Add game" Button.
- Set `--radius` again (0.75rem → 0.5rem).

**Notes:**
- Build on the Dialog: the form with the fields the agent suggested in loop 1.
- Behaviour on Confirm: disabled until titled, then close and reset.
- Behaviour on the grid: persist added games.

**Agent pass:**
- A `useAddGameForm()` hook and an `addGame()` in `useGames()` with localStorage.
- 21 new elements (fields, Labels, Selects, option `.map`s), all ID'd and listed.

**Take back:** 3 of 3 tasks done. Build passes. 0 breaches, 0 repairs. 21 elements added, 4 new locked blocks. **1 orphaned note:** the loop 1 Question, whose Button was deleted. It shows in the Notes tray, as designed.

| Check | Result |
|---|---|
| IDs | 62/62 survive, 0 duplicates, all well-formed (21 new) |
| Tokens | 3/3 intact (the ledger follows the latest value); the agent didn't touch `globals.css` |
| Build | passes |
| Agent logic (Skeleton's loop 5 edits) | unchanged. The only agent-authored lines touched are the two I targeted, from the Layers tree, inside the closed dialog: a form-field Stack's opening tag (`gap-2` → `gap-1`) and a Label's text ("Hours played" → "Hours"). |

### Loop 5: details sheet, orphan tray, edits inside the dialog (clean)

**Skeleton edits (UI):**
- Discarded the orphaned loop 1 note from the Notes tray.
- From the Layers tree, inside the closed dialog: the agent's form-field Stack `gap-2` → `gap-1`, and its Label "Hours played" → "Hours".
- Dropped a Separator under the title.
- Set the `--secondary` token.

**Notes:**
- Build on the card template (inside the agent's `.map`): a details sheet with a status select.
- Question on the Stats grid: should Dropped games count?

**Agent pass:**
- A `useGameDetails()` hook and `setGameStatus` with localStorage.
- Cards are clickable (mouse and Enter/Space) and open a Sheet. 16 new elements, all ID'd and listed.
- Answered the Question without changing code, as asked.

**Take back:** 2 of 2 tasks done. Build passes. 0 breaches, 0 repairs. 16 elements added, 7 new locked blocks.

**Closing session:** Skeleton edits on the agent's pass 5 code: the sheet body Stack `gap-4` → `gap-6`, and its Label "Hours played" → "Hours". Both are inside the agent's conditional and fragment. They were committed by a sixth hand off with no tasks, then taken straight back (an empty pass), so the project ends with the user.

| Check | Result |
|---|---|
| IDs | 84/84 survive, 0 duplicates, all well-formed (16 new) |
| Tokens | 4/4 intact; the agent didn't touch `globals.css` |
| Build | passes |
| Agent logic (closing edits) | unchanged. The only agent-authored lines touched are the Stack's opening tag and the Label text, both targeted in the UI. |

## Result: Gate 6 passed

**5 consecutive clean loops, with no failures and no resets.**

**Whole run** (scaffold to the final take back, 13 commits):
- **IDs:** 101 committed over the project's life, 100 at the end. The one missing, `ui_27ttm`, is the placeholder button deleted in Skeleton in loop 4 (its note went through the orphan tray). No duplicates or malformed IDs at any take back.
- **Tokens:** 5 token edits across 4 tokens (one set twice), all intact at the end. The agent never edited `globals.css`, and never hard-coded a colour: in loop 2 it used the existing tokens and offered to ask for new ones.
- **Agent-authored logic:**
  - Across the five post-pass edit sessions, Skeleton changed 6 agent-authored lines, every one targeted in the UI: 3 opening tags (class changes) and 3 texts. Prettier reflowed one of those tags, and only that tag.
  - Moves of agent code (the Grid with its `.map`, the controlled Select) re-indented it and changed nothing else.
- **Contract:** 0 breaches and 0 auto-repairs in 5 passes. The agent kept every ID, listed its new ones in `HANDOFF.md`, ticked every task (13 of 13), answered both Questions without writing code, and put its logic in `src/hooks`.

**Caveat:** the "user" here was a script driving the real UI, not a person. The gate proves that the loop keeps its integrity under real feature work. A person will find friction a script doesn't. F-1 to F-6 are only what showed up when the script had to aim like a person.

**Artefacts:**
- `fixtures/post-agent/dogfood-01/`: the final project (buildable).
- `dogfood-01.bundle`: its full history.
- `dogfood-01.tokens.json`: the token ledger.
- `packages/app-main/e2e/dogfood-verify.mjs`: the checks.
- `packages/app-main/e2e/dogfood.test.ts`: the user's side, step by step.

## Friction (for T6.4)

- **F-1: A drop meant for "below the toolbar" went inside it.** Aiming at the bottom edge of a horizontal Stack still counts as inside it (the nearest container under the pointer). Dropping *after* a container that's the last child means finding its parent's padding. In loop 1 the Grid ended up in the toolbar, next to the search box, and had to be moved out in loop 2.
- **F-2: Long pages make reordering hard.** With 8 cards in 2 columns, the title and the toolbar couldn't be seen together with the Grid's grip. A move near the frame's top edge autoscrolls (as designed), which shifted the drop to the wrong side of the title. Workaround: make the grid shorter first (4 columns).
- **F-3: Dragging in Skeleton's chrome selects its UI text.** A drag that starts outside the canvas selects headings, buttons and the dev-server log.
- **F-4: A Card dropped "next to" a Card goes inside it.** Card accepts children, so aiming at the right edge of card 1 put card 2 inside card 1 (between its header and content). Card 3 then went inside card 2. Placing sibling cards in a grid means aiming at the grid's empty columns or gaps. Recovery: delete the nested cards (immediate, since there's no agent code in them) and drop again. Same root cause as F-1: a drop always goes into the nearest container under the pointer. Near a container's edge there's no way to say "beside this".
- **F-6: You can't compose inside a closed Dialog.** Its content isn't rendered on the canvas while it's closed, and in select mode clicking the trigger selects it instead of opening it. So there's nowhere to drop a Form into it. The text of its title and description can still be edited from the Layers tree. In loop 4 the form went to the agent as a Build note instead.
- **F-5 (minor): Stat cards come with template text.** Every Card arrives with "Card title / Card description / Card content", which then needs three text edits per card.
