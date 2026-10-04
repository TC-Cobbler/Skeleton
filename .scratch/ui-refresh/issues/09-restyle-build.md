# Decide how the restyle is built: style structure and icon set

Type: grilling
Status: resolved
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

The renderer styles itself with one plain `packages/app-renderer/src/styles.css`. The overlay styles its canvas chrome inline, in its shadow root.

1. **Structure:** to carry the approved Compact pro style, do we keep plain CSS with a token layer of its own (custom properties for the colours, sizes and type above, shared by the renderer and the overlay chrome), or adopt something else?
2. **Icons:** which open-licensed outline icon set matches the approved icons (1.5px stroke, rounded caps, 20px and 16px canvases), and how is it bundled (inline SVG components, a sprite or a font)? Licences must allow shipping inside Skeleton.
3. **Tooltips:** how are they provided, so that every icon-only button gets one on hover and on keyboard focus?

The answer fixes the build approach the spec describes. It must respect the non-negotiables: the overlay never imports from core, and the user's project styling is never touched.

## Answer

Settled with Johnny in one grilling round (all recommendations taken).

1. **Style structure:** plain CSS, with no Tailwind or CSS-in-JS in Skeleton's own UI.
   - **Shared style values file.** A small folder that both the renderer and the overlay read holds one file of CSS custom properties: the Compact pro colours, sizes and type from [Settle the dark visual style](04-visual-style.md).
   - **Renderer.** Today's 853-line `styles.css` is split into a few area files: base controls, shell layout, panels and canvas chrome. All of them use only those custom properties.
   - **Overlay.** It injects the same values file into its shadow root and drops its hard-coded hex colours (selection, agent code, drop, theme, handle and note-pin colours). It still never imports core, and the user's page styling is never touched.
2. **Icons:** **Lucide** (ISC licence).
   - `lucide-react` in the renderer, so only the icons used are built in. The plain `lucide` package covers the few overlay icons.
   - Stroke is fixed at 1.5px; sizes are 20px, or 16px in lists.
   - The licence notice goes in ⋯ → About.
3. **Tooltips:** Skeleton's own small Tooltip plus an **IconButton** component that requires a label.
   - The label is the button's accessible name and its tooltip text.
   - The tooltip shows after ~0.5 s of hover and at once on keyboard focus, and hides on Escape or blur.
   - Native `title=` hints are removed throughout.
   - A test fails if any icon-only button bypasses IconButton.
4. **Window frame:** keep the native frame. Electron is told the app is dark (`nativeTheme.themeSource = "dark"`, window background `#111`), so the OS title bar goes dark where the system allows. A frameless window is not part of this refresh.
