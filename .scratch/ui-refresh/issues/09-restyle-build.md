# Decide how the restyle is built: style structure and icon set

Type: grilling
Status: open
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

The renderer styles itself with one plain `packages/app-renderer/src/styles.css`. The overlay styles its canvas chrome inline, in its shadow root.

1. **Structure:** to carry the approved Compact pro style, do we keep plain CSS with a token layer of its own (custom properties for the colours, sizes and type above, shared by the renderer and the overlay chrome), or adopt something else?
2. **Icons:** which open-licensed outline icon set matches the approved icons (1.5px stroke, rounded caps, 20px and 16px canvases), and how is it bundled (inline SVG components, a sprite or a font)? Licences must allow shipping inside Skeleton.
3. **Tooltips:** how are they provided, so that every icon-only button gets one on hover and on keyboard focus?

The answer fixes the build approach the spec describes. It must respect the non-negotiables: the overlay never imports from core, and the user's project styling is never touched.
