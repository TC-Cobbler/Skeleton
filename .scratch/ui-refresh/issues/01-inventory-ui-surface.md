# Inventory every user-visible string and control

Type: task
Status: resolved
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

What does Skeleton's UI actually show today? Produce `.scratch/ui-refresh/inventory.md`: every panel, control, label, tooltip, `aria-label`, placeholder, empty state, error, confirmation and toast in `packages/app-renderer` and the overlay chrome, each with (a) where it appears, (b) what it does in plain words, (c) a jargon flag (dev term / CSS term / file name / fine as is), and (d) whether any test (unit or e2e) asserts on that text. Also note which panels are everyday vs plumbing. AFK: the agent drives it alone.

## Answer

Done: [inventory.md](../inventory.md) (snapshot of `main` @ `f7504d0`). It lists every visible string and control, by area, with where it appears, what it does, a jargon flag and the tests that query it.

- **Size:** about 260 visible strings in the renderer and overlay, plus 23 palette entries and their descriptions, 9 property groups, 19 raw prop names, and about 80 main/core messages that can reach a toast. About 110 of the 260 are flagged as developer, CSS, file or code text.
- **Panels:**
  - **Everyday:** canvas, Layers, Palette, Selection + Properties, Hand off / Take back, Undo / Redo.
  - **Occasional:** Pages, Notes, Tokens, Violations, the Pass summary, the Colour panel.
  - **Plumbing:** Dev server and its log, View source, the version line, the project path, the Pass detail (files changed, diff, repairs, breaches), and Selection's Kind and ID rows.
- **Concept hot list** for the vocabulary ticket: token, violation/override, locked (which also names the canvas veil), data-ui-id/ID (shown on every label and row), pass/handoff #n, orphaned, contract breach/repaired, diff, dev server, Kind values (palette/primitive/plain), CSS property words and raw prop names, gizmo scopes (Drag/Shift/Alt), Detach/Attach, Snap/Promote/Keep, and Select/Interact mode (its button shows the current state, but reads like an action).
- **Tests:** 140 distinct UI texts are used by tests to find or check things (12 e2e files plus `nodes.test.ts` and `mapping.test.tsx`). The rest go by `data-testid`. Core and app-main unit tests assert on error-message text.
- **Found:** "Light / Dark" means the *preview's* theme, which becomes ambiguous once Skeleton's own chrome is dark.

