# Known issues

## KI-1: "lost" clicks and drops on a scaled canvas frame

**Seen:** 2026-09-30, Phase 2 (Gate 2 runs), then in Phase 3–5 e2e tests.

**Status:** re-diagnosed 2026-09-30. Input to the scaled frame is **not** being lost. What was reported as lost input is two e2e-test problems and one small renderer bug, below. The original Phase 2 report ("the overlay receives no pointer event") didn't reproduce: 240 canvas clicks and 210 palette drops lost none.

**How it was checked:**
- **Real vs synthetic input.** The e2e helpers were switched to real X server mouse events (`xdotool` under Xvfb), which take the same path as a physical mouse, and compared with Playwright's CDP input in alternating runs. Both failed the compose reproducer at the same rate (1 run in 10 each), so the input type doesn't matter.
- **Where clicks land.** In Gate 2, the pointer arrives in the frame exactly where it was aimed (to within 0.1 px, at zoom 0.73).
- **Screen size and frame reloads:** ruled out.

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

### 2. Gate 2 "canvas click not delivered" (open, test-only)

Gate 2 still reports 4–7 such elements per fixture: the same IDs every run, all of them selected from the tree. Every one of those clicks is delivered, and the overlay selects something. The gate aimed at a point where its own hit test and the overlay's disagree:
- **Disabled buttons.** shadcn's disabled Button has `pointer-events: none`, so `elementFromPoint` skips it and the gate thinks the point belongs to the parent (e.g. the pagination row, or the filter bar). The overlay deliberately descends into children by box (`deepestAt`) and selects the disabled button that's visibly there (`Previous`, `Clear`).
- **Child corners.** The gate's 4 px margin is checked as a cross, not a square. A point a fraction of a pixel diagonally off a child's corner passes it, and there the browser (layout units) and `deepestAt` (float rects) round differently. An example is the CardTitle inside a CardHeader.

The message still says "(KI-1)", which is now wrong.

**Still to do:** the gate should aim only where both rules agree, with a square margin. A first attempt, which mirrored `deepestAt` in the gate, failed outright: clicking a disabled `Previous` button selected its row, and three other points resolved differently too. So the overlay still resolves some points differently from `deepestAt`. That needs understanding before the gate changes, and it may be a user-facing selection bug for disabled buttons.

### 3. Other reports under KI-1 (not re-checked)

- **A different palette entry is occasionally placed** than the one aimed at (Gate 4 setups). This may be the same helper race as (1): the next drag started while the previous edit was still in flight.
- **A gizmo press can be lost** (`dragGizmo` retries it).

Neither was reproduced in this investigation.
