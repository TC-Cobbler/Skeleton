# 008: Editing from the canvas

**Status:** accepted · 2026-09-30 · T3.2 (applies to all of Phase 3)

## Context

From Phase 3 the canvas edits code. Every edit must still be one core edit op in main (ADR 003: the renderer never touches files), producing a minimal diff. The canvas is a zoomed, cross-origin iframe (ADR 006). Chromium sometimes drops input to it (KI-1), and the renderer can't see into it.

## Decisions

**One IPC channel for edits: `page:edit`.** Its request is `{ projectRoot, file, edit }`, where `edit` is an intent (`{ op: "insert", parentId, index, paletteId }`, with more ops to come in T3.3 onwards). Main validates the intent's shape and hands it to `Editor` (`app-main/src/project/editor.ts`), which:

- runs edits one at a time per project, each on the file as the previous one left it
- mints IDs against every `data-ui-id` in the project's `src/`, then Prettier-formats the template on its own (with the project's Prettier config, if any)
- runs the core op, and writes the result atomically
- returns the diff and the ID to select

A refused op (locked target, bad index) comes back as `edit-refused` with the op's message, and nothing is written.

**Drags are pointer-driven, in the renderer, not HTML5 drag and drop.**

- A press on a palette entry becomes a drag after 4 px.
- While dragging, the canvas iframes get `pointer-events: none`, so the renderer keeps receiving pointer events. The canvas acts as a shield.
- Each frame converts the pointer to its own unscaled coordinates and posts `drag` to its overlay. The overlay answers `drop-target`.
- On release over a target, the renderer sends `page:edit`. Escape, releasing elsewhere, or the window losing focus cancels the drag.

**The overlay decides where a drop lands**, because only it can see the rendered layout:

- It hit-tests the point and walks up to the nearest node the host marked `drop`: an editable, text-free container with an ID. That means a palette part or primitive whose schema takes `nodes`, or a plain layout element (`div`, `section`, `form`, …).
- The container's flow comes from its computed style: flex direction, a grid with more than one column, or otherwise vertical.
- The index is where the point falls among the children's rendered rects. Indexes count children as `insert` does, and exclude the node being moved (T3.3).
- The overlay draws the container and an insertion line, or fills an empty container.

## Consequences

- The drop geometry (`overlay/src/drop.ts`) is pure and unit-tested. The rest is covered by `e2e/compose.test.ts`, which drags with the real mouse.
- Drop targets depend on the palette schemas reaching the renderer. Until `palette:list` answers, nothing is droppable.
- e2e tests wait for a placed element to be selected and mapped on screen before the next step (`placeFromPalette`). That's the signal that the DOM and the tree are the same version.
