# Spike log (Phase 0)

Every failure from the T0.9 manual loop test goes here. Each core bug gets a pathological fixture in `/fixtures/pathological` that stays forever.

## Loop 1: 2026-09-29

**Setup.** `fixtures/base` was copied to a scratch git repo. Each round:

1. Scripted edits with `pnpm spike` (Skeleton's side).
2. A hand-written `HANDOFF.md`, committed as `skeleton: handoff #N`.
3. An agent pass, committed as `agent: pass #N`.
4. `pnpm spike analyse <handoff> <pass>`.
5. More scripted edits on top of the agent's code, committed as `skeleton: edits after pass #N`.

`pnpm build` ran after every step.

**The agent** was a fresh Claude Code subagent each round. It was told only to act as Claude Code in the project directory, read its `CLAUDE.md` (the round-trip contract), and "do the tasks in HANDOFF.md". It didn't know it was being tested.

**Artefacts.** The final project is in `fixtures/post-agent/loop-01/`, and its full history is in `fixtures/post-agent/loop-01.bundle`.

### Results per round

| Round | Skeleton edits | Agent tasks | Analyser | Edits after pass | Build | Clean? |
|---|---|---|---|---|---|---|
| 1 | token, insert stats row, setProp | mock data → table, New order dialog, 2 stats | clean | move locked `<NewOrderDialog>` **broke indentation (S2)**, fixed then redone; setClass; dark token | ✓ | ✗ (S2) |
| 2 | insert filter row, insert column header, token | filter behaviour, status column, CSV export | clean | move filter row (with agent logic) into card header; setClass; edit inside `.map` refused | ✓ | ✓ |
| 3 | insert activity card, token | recent-orders list, empty-filter row, Question | clean | move card containing a conditional; setClass; dark token | ✓ | ✓ |
| 4 | insert pagination controls | pagination, status badges | clean | setClass on a multi-line opening tag; move stack with agent logic; token | ✓ | ✓ |
| 5 | insert un-imported `<Input>` **broke the build (S5)**, rolled back; insert Clear button; token | Clear behaviour, count in title | clean | setClass on a title holding an agent expression; move the one-line stats row; token | ✓ after rollback | ✗ (S5) |

**Whole-run checks** (from `skeleton: handoff #1` to the final commit):

- **IDs:** 0 orphaned and 0 duplicate. The project ended with 68 IDs, and all of them are well-formed.
- **Tokens:** all 7 Skeleton token edits are present at the end. The agent never touched `globals.css`.
- **Agent-authored lines:** across the 5 "edits after pass" commits, comparing lines with leading whitespace ignored, the only changed lines are the targeted opening tags. The moves re-indented agent JSX and changed nothing else.
- **Violations:** the agent introduced none in 5 passes. When it wanted status colours, it asked for `--success` and `--warning` tokens in `HANDOFF.md` rather than hard-coding them.

**Gate 0 status after loop 1:** not met. Rounds 1 and 5 each had a failure, so the longest clean run was 3 (rounds 2–4).

### Core bugs

- **S1 (low): a one-line template is inserted as one line.** `insert` prints new nodes with recast's printer, so a one-line template becomes one very long line (the stats row in round 1). The code is valid but unreadable.
  → Fixed in T0.10: templates are formatted with Prettier before insertion.
- **S2 (high, fixed during loop): `move` broke the indentation of multi-line blocks.** Moving `<NewOrderDialog>…</NewOrderDialog>` over-indented its first line and left the inner lines at their old depth. Recast's reprint of a moved node is unreliable, especially when the removal and insertion happen in the same parent. The unit test missed it because it compared indentation-stripped text.
  → Fixed in commit "fix(core): move keeps a multi-line block's indentation". The node is now moved as original source text through a placeholder, re-indented by the column delta and never inside template literals. Fixtures: `pathological/post-agent-pass1.tsx` and `pathological/template-literal-block.tsx`, with exact-output tests.
- **S3 (low): `setClass` moves a replaced class to the end.** Removing `text-2xl` and adding `text-3xl` gave `font-semibold text-3xl`.
  → Fixed in T0.10: added classes take the position of the first removed class.
- **S4 (low): recast wraps long new nodes in its own style.** It breaks attributes across lines with the `>` left on the last attribute's line, which isn't Prettier's style.
  → Same fix as S1.
- **S5 (high): `insert` doesn't add imports.** Inserting `<Input>` into a page that didn't import it produced `Cannot find name 'Input'` and a failed build. In the app, T3.7's build check would roll it back, but the op itself must be complete.
  → Fixed in T0.10: `insert` takes the imports it needs and adds them surgically. Fixture: `pathological/post-agent-pass4.tsx`.

### Agent and contract findings

- **A1 (contract gap): an agent-created wrapper had no ID.** The agent wrapped Skeleton's `ui_new0r` Button in `<NewOrderDialog onCreate={…}>` with no `data-ui-id`, although contract rule 1 says every created JSX element gets one. The analyser didn't report it, because it only checks editable nodes for missing IDs.
  → Fixed in T0.10: the analyser also reports un-ID'd locked elements, and the contract spells out that wrappers count as new elements.
- **A2 (design): agent code swallows Skeleton elements into locked blocks.** Wrapping (`ui_new0r`), conditionals (`ui_qci08`) and `.map` (the table row and cells) all put Skeleton-placed elements inside locked blocks, where they can't be edited any more. This is the conservative rule working as designed, and the IDs survive. **Open question for the user.**
- **A3 (Phase 2 note): IDs repeat at runtime.** An ID inside `.map` appears once per row in the DOM, though only once in the source. The agent pointed this out itself. The overlay (T2.2) has to map a DOM hit to its source element, not assume one DOM node per ID.
- **A4 (design): Behaviour tasks lock their targets.** Any `onClick`, `disabled={…}` or `variant={…}` makes the element "logic-bearing", so it's locked. By the end, 8 Skeleton-placed Buttons were locked for this reason, and 17 of the page's 50 tree nodes (34%) were locked. `setClass` and `setProp` on a literal attribute would be safe on such an element, since they touch only one attribute, but T0.3 defines logic-bearing as locked. **Open question for the user:** allow literal-attribute edits on logic-bearing elements? Loosening a lock is a scope call, so I've left it as is.
- **A5 (positive): the agent kept the contract.** In all 5 passes it kept IDs, minted new unique ones and listed them in `HANDOFF.md`, ticked tasks, answered the Question, put logic in `src/hooks` and `src/lib`, and asked for tokens instead of editing `globals.css`.

## T0.10: fixes from loop 1

- **S1, S4 (fixed).** `insert` now writes the template text verbatim through a placeholder, re-indented to the insertion depth, the same way `move` does. The spike CLI mints missing IDs as text and formats each new template with Prettier before inserting it. Prettier only ever sees the new node.
- **S3 (fixed).** `setClass` puts added classes where the first removed class was, so a swap stays in place.
- **S5 (fixed).** `insert` takes `imports` and adds them as text: appended inside an existing `import { … } from "<module>"` (single- or multi-line), or as a new line after the last import. It refuses the edit, naming the component, if any component in the template would still be unresolved. The CLI resolves palette and primitive imports from the project's `src/components/ui` and `src/components/layout` exports.
- **A1 (tightened).** The analyser reports `unIdedLocked`: locked JSX elements (custom components, wrappers) in page files that have no ID. The fixture contract now says a wrapper component is a new element and needs its own ID. These are reported, not auto-repaired, because an agent-owned element isn't Skeleton's to rewrite.
- **Not changed; waiting on a decision.** A2 (agent code swallowing Skeleton elements into locked blocks) and A4 (logic-bearing props lock the element). Both need a scope decision from the user.
