# Research Adobe's public design conventions for dark desktop apps

Type: research
Status: resolved
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

What do Adobe's public design system (Spectrum / Spectrum 2) and its desktop apps document about dark-theme colour values, type scale, spacing density, panel/inspector structure, tool rails, and icon + label conventions? Capture concrete, citable values and patterns the visual-style ticket can borrow (not brand assets, logos or names).

## Answer

Spectrum 2 has a single dark theme with a 13-step gray ramp. For a pro editing app, the backgrounds are: pasteboard and base `#111111`, panels and app frame on layer 1 `#1B1B1B` or layer 2 `#222222`, and hover `#2C2C2C`. Text is `#DBDBDB`, secondary text `#AFAFAF` and captions `#8A8A8A`. Blue is the only accent: fill `#4069FD`, used for focus rings (2px with a 2px gap), the active tool, and the selected layer row at 10% opacity. Panels otherwise stay monochrome.
Use the desktop ("medium") scale, which is 1× (touch is 1.25×). Controls are 14px/18px type, 32px tall (24px compact). Spacing steps are 2/4/6/8/12/16/24px. Icons are 20px in toolbars and 16px in the layers list, with a 1.5px stroke. Panels are 260px wide by default (200–400px) and come in compact, regular or spacious density.
Icon-only buttons and tabs must have tooltips. Tooltips show on hover or focus, have no actions, use 12px text, and appear after a warm-up delay (1500ms in React Spectrum). Adobe's fonts are restricted, so Skeleton uses `ui-sans-serif, system-ui`. The guidance also asks UI text to describe what a control does, not where it is, and to avoid the words "rail" and (where possible) "panel" on screen.
— full findings: [research/adobe-spectrum.md](../research/adobe-spectrum.md)
