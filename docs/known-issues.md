# Known issues

## KI-1: "lost" clicks and drops on a scaled canvas frame (resolved)

**Seen:** 2026-09-30, Phase 2 (Gate 2 runs), then in Phase 3–5 e2e tests.

**Status:** resolved 2026-09-30. Input to the scaled canvas frame was never being lost for a user. Every symptom came from how the e2e tests aimed, waited or sized the window. One small renderer bug turned up on the way and is fixed. The sections below say what each symptom was.

**How it was checked:**
- **Real vs synthetic input.** The e2e helpers were switched to real X server mouse events (`xdotool` under Xvfb), which take the same path as a physical mouse, and compared with Playwright's CDP input in alternating runs. Both failed the compose reproducer at the same rate (1 run in 10 each), so the input type doesn't matter.
- **Where clicks land.** In Gate 2, the pointer arrives in the frame exactly where it was aimed (to within 0.1 px, at zoom 0.73).
- **Ruled out:** frame reloads, iframe resizes and screen size.

### 1. Palette drops "lost" in `compose.test.ts` (fixed)

**Cause:** a race in the test helper, made possible by a one-frame selection flicker in the renderer.
- `useSelection` stored the selection by tree key and re-pointed it by `data-ui-id` in an effect, which runs after paint.
- Keys are child-index paths, so after every edit the Selection panel (and gizmos) showed, for one frame, the element now at the old key, or nothing.
- `placeFromPalette` accepted any changed selection as "the placed element". The flicker could satisfy that, so it returned before the drop landed (in one trace, before the Card was even released), and the test read the file too early.

**Fix (`56f23a7`):**
- The selection is resolved against the current tree while rendering (`app-renderer/src/selection.ts`, tested in `tests/selection.test.tsx`).
- `placeFromPalette` waits for an ID that wasn't in the layers tree before the drop.

The reproducer went from failing about 1 run in 3 to 20 of 20 passing.

**User-facing part:** the one-frame flash of the wrong element (or an empty panel) after every edit. It's fixed by the same change.

### 2. Gate 2 "canvas click not delivered" (fixed)

Gate 2 retried a missed click, then selected the element from the tree, and blamed KI-1. It fell back for 4–7 elements per fixture in every run. There were four causes, all in the test:

- **Disabled buttons.** shadcn's disabled Button has `pointer-events: none`, so `elementFromPoint` skips it. The gate thought the point belonged to the parent (the pagination row, the filter bar). The overlay deliberately descends into children by box (`deepestAt`) and selects the disabled button that's visibly there. Clicking a disabled button on the canvas selects it, as it should.
- **Child corners.** The gate checked its 4 px margin as a cross, not a square. A point a fraction of a pixel diagonally off a child's corner passed. There, the browser (layout units) and `deepestAt` (float rects) round differently.
- **The selection's handles.** Gate 2 selects elements in document order, so a parent is selected just before its children. The parent's gizmo handles are drawn a moment after the selection: a 10 px radius dot inside its top-left corner, and padding handles on its edges. They often sit over its first child. If the gate aimed before the handles were drawn, the click grabbed a handle and the parent stayed selected. This is by design: a visible handle takes the press.
- **Viewport emulation.** Gate 2 used `page.setViewportSize(1600×1000)` (CDP emulation), while the real window was 1280×800 (773 px of content). CDP input at a point beyond the real window reaches the page, but not reliably a cross-process iframe: there's no real surface there to route it through. This was the only case where the frame got no event at all.
  - Beyond the edge: 2 of 6 clicks lost.
  - Inside the real window: 0 of 127 lost.
  - A user can't click there.

**Fix:**
- The gate aims where the overlay's rule says the element is, with no overlay layer on top and a square margin.
- It waits for the overlay to settle before aiming.
- It sizes the real window with `setContentSize`.
- Its retry and tree fallback are removed: one missed click now fails the gate, naming what was selected instead.

Result: 5 of 5 runs, 350 canvas clicks, none missed. The elements selected from the tree are only those with no point of their own.

### 3. Other reports under KI-1 (not re-checked)

- **A different palette entry is occasionally placed** than the one aimed at (Gate 4 setups). This may be the same helper race as (1): the next drag started while the previous edit was still in flight.
- **A gizmo press can be lost** (`dragGizmo` retries it). The handle race in (2) is a likely cause.
Neither was reproduced in this investigation.

## KI-2: Gate 4's Alt-drag label sometimes isn't found (open, intermittent)

Seen once in 5 runs (2026-10-01, before T8.1 changed anything): during the Alt-drag in `gate4.test.ts`, the drag started (its live preview was there), but `label()` found no handle label within 2 s and returned null. The following 4 runs passed, and so did `tokens.test.ts`'s Alt-drag. It's not caused by the UI refresh. It's worth a look if it recurs: the label may be redrawn away while Alt is held.
