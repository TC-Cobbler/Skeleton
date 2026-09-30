# 005: Dev server manager

**Status:** accepted · 2026-09-30 · T1.3

## Context

Each open project needs its own Vite dev server (PRD §7.2), restarted only when dependencies change (Vite's HMR handles source edits), with logs and errors visible in the app.

## Decisions

- **One Vite process per project, owned by main** (`src/devserver/manager.ts`).
  - Main picks a free port and runs the project's own `node_modules/vite/bin/vite.js` with `--host 127.0.0.1 --strictPort`.
  - It runs Vite with Electron's binary and `ELECTRON_RUN_AS_NODE=1`, so users don't need Node on their PATH.
  - "Running" means Vite printed its `Local:` URL. Missing that line within 30 s means `failed`, and an unexpected exit means `crashed`, both with the reason.
- **Restarts only on dependency change.**
  - Main watches `package.json` and `pnpm-lock.yaml`, and compares a signature of the declared dependencies (plus `pnpm` config) and the lockfile hash.
  - Renames, script edits and other non-dependency changes do nothing.
  - A real change kills Vite, runs `pnpm install --prefer-offline`, and starts a fresh Vite. A failed install shows as `failed` with pnpm's output.
- **Process hygiene.** Vite runs detached in its own process group on POSIX and is stopped by signalling the group (SIGTERM, then SIGKILL after 3 s), which takes its esbuild children with it. Main stops every server before the app quits.
- **Logs are polled, not pushed.** `devserver:status { projectRoot, sinceSeq }` returns the state plus log lines after a cursor, from a 2000-line ring buffer. Error lines (stderr, or lines matching error/failed) are flagged, and the latest is surfaced as `lastError`. The IPC contract stays invoke-only, with no event channel through the preload, and the panel polls every 500 ms.

## Consequences

- The dev server panel and the Phase 2 canvas get status from the same channel.
- Windows would need a process-tree kill (`taskkill /T`) instead of process groups; that isn't needed for v1 (macOS and Linux).
- Polling costs one cheap IPC call every 500 ms per visible panel. Revisit if the Phase 2 canvas needs lower latency, e.g. for reload-on-restart.
