# 012: Dogfood fixes (v1.0.x)

**Status:** accepted · 2026-10-01 · T7.1–T7.5 (ROADMAP.md, v1.0.x)

## Context

The Phase 6 dogfood lost no code, IDs or tokens, but composing was slow in five places (`docs/dogfood-log.md`, F-1 to F-6). These are fixes to v1's own features. No new scope: every change goes through the edit ops that already exist (`insert`, `move`, `setText`), and none of them writes anything new to the user's project.

## Decisions

**Drop beside a container, aimed at its edge (T7.1, F-1, F-4).** The overlay's `dropAt` still finds the innermost drop container under the pointer. Before dropping into it, `besideAt` checks whether the point is in the container's edge band, judged along its parent's flow:

- **Edges:** top and bottom in a column; left and right in a row or a grid.
- **Band size:** 8 px, but never more than a quarter of the container, so a small container still has a middle to drop into.
- **When it applies:** only if the parent takes drops (so never a locked parent), and the drop goes before or after the container there, as an ordinary `insert` or `move`.
- **Climbing:** if the innermost container isn't at an edge, its ancestors are checked, innermost first. Edges often coincide: a Card's header spans the Card's width, so its right edge is the Card's.
- **Same axis:** if the container lays out its own children along the same axis as the edge (a column in a column), its edge also means "first" or "last" inside it. There the band counts only where no child is under the point, which is the container's own padding.
  - Without this rule, Gate 5's drop "after the paragraph in the right Stack" went after the Stack.
  - Across axes (a row toolbar in a column, a Card in a grid), "into" says nothing at that edge, so the band always counts.
- **The label says which:** "After Card in Grid", or "Into Stack".

**Reorder with Move up / Move down (T7.2, F-2).** These are buttons in the Selection panel, with Alt+↑/↓ as shortcuts (the overlay forwards them from the frame too).

- Each is one `move` to the previous or next index under the same parent. `reorderTarget` computes it, counting siblings with the node taken out, as `move` does.
- The buttons say why when they're off: already first or last, inside a locked block, or the parent has no ID.
- Dragging rows in the Layers tree was the alternative. It was left out: it needs its own drop geometry, while the buttons reuse what exists and work on any page length.

**No text selection in the chrome (T7.3, F-3).** `body` gets `user-select: none`. These stay selectable:

- text fields
- `code` and `pre` (source views, diffs, the project path)
- the dev-server log
- error messages

**Open a Dialog or Sheet on the canvas (T7.4, F-6).** When the selection is a Dialog or Sheet, or anything inside one, the Selection panel shows "Open Dialog in canvas".

- **How it opens:** the overlay clicks the Dialog's own trigger (Radix marks it `aria-haspopup="dialog"` and `aria-expanded`), letting that one click through select mode. The app opens it the way it always would.
- **No code changes:** nothing is written, and `defaultOpen` is not toggled.
- **While it's open:** its content is mapped like any other DOM, so drops, selection, gizmos and text edits work inside it. It stays open across edits, because Fast Refresh keeps Radix's state.
- **Reporting:** the overlay reports `open-state` for the Dialog the host watches. It's `null` when no trigger is on screen (say, an agent-controlled `open`), and then the button is off and says why.
- Rendering the content some other way (`forceMount`, a portal into the canvas) was rejected: it would mean editing the code or the component.

**Edit text on the canvas with a double-click (T7.5, F-5).**

- **Who decides:** a double-click in select mode asks the host (`text-request`). The host answers only for elements the Properties panel can edit with `setText` (`textEditable`, now shared by both).
- **The editor:** the overlay puts an input over the element, in the element's font, inside its own shadow layer. It sits outside the part that's redrawn each frame, so redrawing keeps its focus. The app's DOM is never edited: React owns it, and editing it in place would desync React's text nodes.
- **Keys:** Enter or leaving the field commits a change as one `setText`. Escape cancels. Inside the field, Delete and Backspace are text, not Skeleton's shortcuts.
- **Inside an open Dialog:** a modal traps focus and would take it straight back from the editor, which sits outside the dialog. So the overlay stops `focusin` and `focusout` into or out of the editor from reaching the app.
- **Why not fewer template parts:** cutting the Card template would change the palette's round-trip-tested templates. A double-click makes each text a single action instead.

## Consequences

- **New host ↔ overlay messages:**
  - `open` / `open-state` (F-6)
  - `text-request` / `text-editor` / `text-commit` (F-5)
  - `key` gains `alt`
- **Tests:** `besideSide` is pure and unit-tested. The overlay's beside, open and text-editor behaviour is tested in `overlay/tests/mapping.test.tsx`. `e2e/dogfood-fixes.test.ts` covers all five with the real mouse and keyboard.
- **The inherent ambiguity:** a drop aimed at an edge now means "beside", so dropping into a container at its very edge needs aiming a little further in. The band is small, and the label always says which it will be.
