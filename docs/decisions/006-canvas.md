# 006: Canvas, overlay and source mapping

**Status:** accepted · 2026-09-30 · T2.1, T2.2 (applies to all of Phase 2)

## Context

Phase 2 shows the user's running app in Skeleton and makes every element selectable, locked blocks included, with the canvas and the layers tree in sync. That needs three things:

- an embedding that can't reach Skeleton's privileged bridge
- a script inside the app (the overlay) that doesn't come from the user's files
- a way to map any DOM node back to its source element, including elements without an ID and the output of custom components

## Decisions

**Embedding: a sandboxed `<iframe>` in the renderer** pointed at the project's dev server.

- **Sandbox:** `allow-scripts allow-same-origin allow-forms allow-modals allow-popups`, with no `allow-top-navigation`. The app is cross-origin to the renderer, so `allow-same-origin` doesn't let it lift its own sandbox.
- **No bridge:** Electron runs the preload only in the top frame, so the app has no `window.skeleton`. Main's sender check rejects it anyway.
- **Alternatives:** `<webview>` and `WebContentsView` were rejected. The iframe gives `postMessage` for free (T2.2), and T2.7's side-by-side widths are just more iframes.
- **CSP:** the renderer's CSP allows `frame-src http://127.0.0.1:*` and nothing else.

**Overlay injection: a dev-only Vite plugin added by Skeleton, never written into the project.** The dev server manager starts Vite through a Skeleton launcher. The launcher loads the project's own Vite and config, and adds one plugin, which:

- injects the overlay script into `index.html`
- serves the overlay bundle (`packages/overlay`) from a virtual module
- tags every JSX element in page files with `data-skeleton-loc="<offset>"` in the served code only. The offset is the element's start in the file on disk, which is the same number core's parser reports as `range.start`.

The user's `vite.config.ts` and sources are never touched, and a production build knows nothing about Skeleton.

**Source mapping: fibers plus offsets.**

- **Host elements** carry `data-skeleton-loc` as a DOM attribute.
- **Custom components** receive it as a prop they usually don't render. The overlay walks React's fiber `return` chain from any DOM node and collects the page-level offsets it passes through, so a DOM node inside `<OrdersTable>` maps to that locked block.
- **`.map` templates and conditional branches** map to their own offsets. Those fall inside the locked expression's range, which is how the overlay finds a block's DOM.
- **Matching:** the renderer sends the overlay the flattened tree (key, kind, name, ID, source range). Matching is by exact start offset for elements and by range containment for locked expressions.

**Host ↔ overlay protocol.** `postMessage` only, with the target origin fixed on both sides. The renderer accepts messages only from its iframe's `contentWindow` and dev server origin, and validates their shape. Messages can only select, highlight, report hover and location, and report HMR updates. Nothing from the iframe reaches main except through the renderer's own, already validated IPC calls.

## Consequences

- The overlay depends on React dev-mode fiber internals (`__reactFiber$…`, `.return`, `.memoizedProps`). These are stable in practice but not a public API, so they're isolated in one module of `packages/overlay` with tests against a real React.
- Offsets are only valid while the served code and the parsed tree come from the same file version. The overlay reports Vite's `afterUpdate`, and the renderer re-parses (T2.6).
- A custom component that spreads unknown props onto the DOM will show `data-skeleton-loc` in dev. That's harmless, and dev only.
