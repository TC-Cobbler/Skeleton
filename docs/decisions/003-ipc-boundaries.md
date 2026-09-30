# 003: IPC boundaries between renderer and main

**Status:** accepted · 2026-09-30 · T1.1

## Context

From Phase 1, Skeleton is an Electron app. CLAUDE.md fixes the split: main owns the
filesystem, git, child processes and all AST work (through `core`); the renderer is
UI only and sends edit intents over IPC. From Phase 2 the user's own project runs
in a webview inside the same app, so the bridge must not be reachable from it.

## Options

1. **One named function per operation on `window.skeleton`** (`readPage()`, …).
   Readable, but every new operation touches preload, main and renderer by hand,
   and the sandboxed preload can't import shared code to keep them in sync.
2. **One typed `invoke(channel, request)` over a single contract type.** The channel
   list and request/response types live in one module; preload stays a few lines.
3. **A library (electron-trpc etc.).** More machinery than the channel count needs.

## Decision

Option 2.

- `packages/app-main/src/ipc/contract.ts` is the single source for channels
  (`IpcContract`), request/response types and `IpcResult`. The renderer imports it
  **types only** via `@skeleton/app-main/ipc`; it has no runtime dependency on
  app-main or core.
- The preload (`preload.cts`, sandboxed, CommonJS) exposes exactly
  `window.skeleton.invoke(channel, request)` over one Electron channel,
  `skeleton:invoke`.
- Main treats everything from the renderer as untrusted input:
  - a **sender check**: only the Skeleton renderer's origin (dev server) or its
    built `index.html` may call; anything else gets `untrusted-sender`
  - a **channel check**: unknown channels get `bad-request`
  - a **per-channel validator**: e.g. `page:tree` needs an absolute project root
    and a `.tsx`/`.jsx` path that resolves inside it
- Handlers never throw across the boundary. Every call resolves to
  `{ ok: true, value } | { ok: false, error: { code, channel, message } }`, and
  every failure is logged in main (no silent catches).
- Handlers are plain functions over injected I/O (`createDispatch(deps, onError)`),
  so they're unit-tested without Electron. An e2e smoke suite launches the real app.
- Windows run with `contextIsolation`, `sandbox`, no `nodeIntegration`, no
  navigation and no pop-ups. The renderer ships a CSP.

## Consequences

- Adding an operation = add it to `IpcContract` and `CHANNELS`, a validator and a
  handler. The compiler flags a channel missing from any of them.
- Responses must be structured-clone-safe plain data (core's `PageTree` is).
- The main entry avoids top-level `await`: Playwright's Electron launcher hangs on it.
- Running as root (containers, CI) needs `--no-sandbox` passed to Electron; the
  e2e suite adds it on Linux.
