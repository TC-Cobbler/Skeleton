# 009: Post-edit pipeline

**Status:** accepted · 2026-09-30 · T3.7

## Context

Every canvas edit should come out formatted and must leave the project compiling. If an edit breaks the build, it is undone and the user told why. Two constraints:

- **Non-negotiables 2 and 3.** Prettier runs only on changed nodes, and code Skeleton didn't place is never altered.
- **Speed.** Edits happen on every drop. A full `tsc -b` on a fresh project takes ~4.5 s, too slow to run per edit.

## Options

- **Prettier range formatting.** Rejected: it expands to the enclosing *statement*, and in a page that's the whole `return (…)`, which would reformat agent code.
- **`tsc -b` or `vite build` per edit.** Rejected: 4–5 s each.
- **An incremental checker.** Chosen: the project's own TypeScript, with a persistent builder program in a worker thread. Measured: ~3.5 s warm-up, then ~60–370 ms per check.

## Decision

Every edit (page edits and page ops, in `Editor`) runs through this pipeline:

1. **The core op.** Nothing is written if it refuses.
2. **Prettier, on the edited node only** (`project/format.ts`), after `setProp` or `setClass`, and only when every attribute on the element is a literal (Skeleton-owned). Tags with agent logic keep their layout (ADR 002).
   - A text-only element is formatted whole, as a JSX child: Prettier lays out statements differently, and puts text on its own line once there's more than one attribute.
   - Otherwise only the opening tag is formatted; its children stay untouched.
   - Inserted templates were already formatted on their own (T3.2).
3. **Typecheck before**, then an atomic write, then **typecheck after** (`project/checker.ts`, `checker-worker.ts`).
   - The worker loads the project's `typescript` and `tsconfig.app.json` (else `tsconfig.json`), and keeps a `SemanticDiagnosticsBuilderProgram` with a source-file cache keyed by text, so only files an edit affects are re-checked.
   - It starts warming up on the project's first edit. If it ever exits, the next check starts a new one.
4. **Roll back** if the edit introduced diagnostics: compared by file, code and message, so moved lines don't count and errors the project already had don't block edits. The files are restored newest first, and never over a file that changed since. The IPC error is `edit-rolled-back`, with the first errors. The renderer re-reads the page and shows a toast.
5. **When the project can't be checked** (no TypeScript, a timeout), the edit stands and the result carries `unchecked: <reason>`. The renderer shows that once as a warning.

**Toasts** (`Toasts.tsx`) replace the sidebar error line. They never take clicks, except on their × button, so they can't block the inspector under them.

## Consequences

- An edit's response now waits for the check, typically 0.1–0.4 s, and up to ~4 s for the first edit while the worker warms up. The canvas updates as soon as the file is written, before the response, so the selection can follow a little after the canvas. Two things came out of this:
  - **A selection epoch:** a response only moves the selection if the user hasn't selected something since the edit was issued.
  - **A release handshake** for drops (ADR 008).
- The check is `tsc`'s, not `vite build`'s. Anything only a bundler would catch (a missing CSS import) isn't. That's acceptable for v1: Skeleton's edits don't touch CSS or bundler config.
