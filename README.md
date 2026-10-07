# Skeleton

Skeleton (a working name) is a desktop app for laying out and styling the UI of a React app while an AI coding agent writes its logic.

You compose screens by dragging elements onto a live canvas, and you tune the design system (colours, corners, spacing, text sizes) with on-canvas handles. Then you hand the project to your agent. When the agent is done, you take it back, review what it changed, and keep going. The code moves between you and the agent without loss: **the code is always the source of truth**, and Skeleton never regenerates a file.

> **Status:** v1 is feature-complete and dogfooded. Five clean hand-off rounds on a real project passed Gate 6. The v1.0.x dogfood fixes and the v1.0.y UI refresh are done. v1.1 is next (see [ROADMAP.md](ROADMAP.md)).

## How it works

```
Create project → Build + Style → Hand off → [your agent works] → Take back → Review → …
```

1. **Create a project.** Skeleton scaffolds a Vite + React + TypeScript + Tailwind v4 + shadcn/ui + React Router app and opens it on the canvas.
2. **Build.** Drag in elements (Column, Row, Grid, Button, Text field, Card, Dialog…), arrange them, and change their settings and text.
3. **Style.** Change the theme (colours, corners, spacing, text sizes) in the Theme panel or by dragging handles on the canvas. A colour set by hand shows up as **off-theme**.
4. **Add notes.** Pin notes for the agent to elements: Build, Behaviour or Question.
5. **Hand off.** Skeleton commits, writes `HANDOFF.md` with your notes as tasks, and pauses the canvas.
6. **Your agent works.** Run any agent in your own terminal. The scaffolded `CLAUDE.md` tells it the rules.
7. **Take back.** Skeleton commits the agent's work, checks it, and shows what changed. It also shows any rules the agent broke, anything it fixed itself, and the agent's replies to your notes.

The loop's state comes from git commit subjects, never from a separate store.

## Principles

- **Code is the source of truth.** Parsed trees are derived data and are thrown away whenever the files change.
- **Surgical edits only.** Every change is a minimal AST patch. Whole files are never reprinted.
- **Agent code is left alone.** Skeleton never changes logic it didn't place. Parts of a page that are agent code (repeated lists, things that only show sometimes, the agent's own components) are locked: you can move or delete them whole and style what's inside them, but Skeleton won't rewrite them.
- **`data-ui-id` is sacred.** Every element Skeleton places carries a stable ID (`ui_` plus 5 characters), which is never dropped, duplicated or rewritten.
- **Plain words.** The interface uses the words in [GLOSSARY.md](GLOSSARY.md), so it makes sense without knowing HTML or CSS.

## Getting started

Requirements: Node 22.13+ or 24+, and pnpm 10.

```sh
pnpm install
pnpm dev           # the Electron app, against the renderer's Vite dev server
pnpm start         # builds the renderer and runs the app without the dev server
```

When running as root (containers, CI), Electron needs `--no-sandbox`:

```sh
pnpm dev --no-sandbox
```

## Development

```sh
pnpm test          # every unit test (Vitest projects)
pnpm test:core     # core's fixture tests only
pnpm typecheck     # tsc across the workspace
pnpm test:e2e      # builds and launches the Electron app (needs a display: xvfb-run -a pnpm test:e2e on Linux)
pnpm spike help    # the Phase 0 CLI over core
```

### Repository layout

```
packages/
  core          headless: parser, edit ops, ID system, token writer, analyser (pure functions)
  cli           thin CLI over core (the Phase 0 spike)
  app-main      Electron main process: files, git, dev server, AST work through core
  app-renderer  React UI: workspaces, panels, canvas, copy file and plain names
  overlay       script injected into the user's app: selection, drop targets, handles
  templates     the project scaffold, including the agent's CLAUDE.md contract
fixtures/       test projects: base, post-agent snapshots, pathological cases
docs/           decisions (ADRs), spike and dogfood logs, UI refresh spec, known issues
```

Process boundaries: the main process owns the filesystem, git, child processes and all AST work. The renderer is UI only and sends edit intents over IPC. The overlay runs inside the user's app and talks to the host only through `postMessage`.

## Documentation

- [PRD.md](PRD.md): what Skeleton is and why
- [TASKS.md](TASKS.md): phases, tasks and their gates
- [ROADMAP.md](ROADMAP.md): what's next and what's deferred
- [GLOSSARY.md](GLOSSARY.md): the words Skeleton shows on screen
- [docs/decisions/](docs/decisions/): architecture decisions
- [docs/ui-refresh-spec.md](docs/ui-refresh-spec.md): the v1.0.y layout, style and messages
- [docs/known-issues.md](docs/known-issues.md): open issues
- [CLAUDE.md](CLAUDE.md): working rules for AI agents in this repo

## License

[MIT](LICENSE)
