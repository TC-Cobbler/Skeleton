# Known issues

## KI-1: occasional lost click on a scaled canvas frame

**Seen:** 2026-09-30, Phase 2 (Gate 2 runs).

**What happens:** when a canvas frame is scaled down to fit (desktop 1280 px in a narrower canvas, or side by side), Chromium occasionally doesn't deliver a mouse click to the embedded app at all. The overlay receives no pointer event, so nothing gets selected. Once it happens, a few more clicks in that frame can be lost before input recovers (Gate 2 runs lost up to three of about 35 canvas clicks; other runs lost none).

**Reproduction:** `fixtures/post-agent/loop-02` at desktop width in a 1600×1000 window, driven by Playwright's mouse (CDP input). Click the Stack `ui_d5ne2`, then the Next button `ui_rzhmr`, then the page text `ui_t77ts`. The third click is lost in roughly one run in three. It never happens at mobile width (scale 1), nor with two clicks alone, nor when the frame is slowed down by extra instrumentation.

**What it isn't:**
- **Not Skeleton's hit-testing or mapping.** The point hits the right element afterwards, nothing covers the iframe in the renderer, and nothing scrolled.
- **Not double-click handling.** Pausing 600 ms between clicks makes it more frequent, not less.
- **Not specific to `transform: scale()`.** Scaling with CSS `zoom` (now used) shows it too, although `zoom` keeps coordinates simpler.

**Current handling:** the Gate 2 test retries a lost click, then selects the element from the layers tree, and reports which elements needed that. Every element is still selectable.

**Also seen in Phase 3 and 4 tests (same cause):**
- **A palette drop can be lost.** The release reaches the frame as a click, which selects what's under it. `compose.test.ts` fails this way about one run in three, before Phase 4 as after.
- **Separately, a different palette entry is occasionally placed** than the one aimed at (seen in Gate 4 setups). That press is in Skeleton's own window, not the frame, so KI-1 may not be the cause. Not yet investigated.
- **A gizmo press can be lost.** The drag never starts and nothing is written. `dragGizmo` (e2e) retries it.
- Gate 4 builds its page by writing the file instead of dropping from the palette.

**To revisit:** whether real (non-synthetic) mouse input shows it at all, which needs a manual check on macOS; whether it tracks Chromium version (Electron 44); and alternatives to scaling a cross-origin frame, e.g. rendering the desktop preview at 1:1 with horizontal scrolling and making "fit" optional.
