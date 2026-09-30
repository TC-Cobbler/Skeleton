# 004: Project template and scaffolder

**Status:** accepted · 2026-09-30 · T1.2

## Context

T1.2 turns the fixture into the template Skeleton scaffolds new projects from (PRD §8): the fixed stack, the curated shadcn set (§9.1), layout primitives, the full v1 token set (§10.1), `/skeleton` files, project docs with the round-trip contract, `git init` and an initial commit. Gate 1 needs new project → running app in under 30 s.

## Decisions

- **Template as files, rendering as a pure function.** `packages/templates/project/` is a plain project tree with `{{name}}`, `{{packageName}}`, `{{skeletonVersion}}` and `{{id:key}}` placeholders. `renderProject(template, vars)` fills them in and mints a fresh `data-ui-id` per key. Only the known placeholders are replaced; vendored code contains `{{` (JSX style objects).
- **Scaffolding I/O lives in app-main** (`src/project/scaffold.ts`), per the process boundaries.
  - Writes the files, runs `pnpm install --frozen-lockfile --prefer-offline --ignore-workspace`, then `git init -b main` and a `skeleton: scaffold` commit.
  - If git has no user identity, the commit falls back to `Skeleton <skeleton@localhost>`.
  - A failed step removes the folder the call created, and the error names the step.
  - Exposed as the `project:create` IPC channel.
- **shadcn is vendored, not fetched at scaffold time.** The `shadcn` CLI needs network access to its registry at scaffold time, which is slower, can fail offline, and gives no pinned result.
  - `scripts/vendor-shadcn.ts` copies the 21 components (§9.1 plus Label, Tooltip and Skeleton, which Form and Sidebar need) from a shadcn-ui/ui checkout.
  - It rewrites import paths and switches the main components' radius classes to per-component tokens.
  - It swaps `next-themes` in Sonner for a `.dark`-class hook.
  - Every adaptation is scripted and counted, so a re-vendor either reproduces it or fails. See `packages/templates/VENDORED.md`.
- **A pinned lockfile ships with the template.** The lockfile doesn't depend on the project name, so one lockfile serves every project. Installs are reproducible, and fast with a warm pnpm store (about 7 s here).
- **Token layout in `globals.css`:**
  - **`:root`:** base values (`--radius`, `--type-base`, `--type-ratio`, `--border-width`) and light colours.
  - **`.dark`:** dark colours.
  - **`@theme inline`:** everything derived from them: per-component radii, the `--text-xs`…`--text-4xl` scale, colour utilities, and `--default-border-width`, which Tailwind v4's plain `border` utility reads.
  - **`@theme`:** static tokens (spacing, fonts).

  Changing a base value moves everything derived from it. Detaching a derived token means replacing its `calc()` with a literal (T4.1).

## Consequences

- Scaffolding requires `pnpm` and `git` on the user's PATH; `$SKELETON_PNPM` overrides the pnpm binary. A GUI-launched app on macOS may not inherit the shell PATH, which needs handling when packaging.
- Updating shadcn is a deliberate step (`pnpm --filter @skeleton/templates vendor <checkout>`, then review the diff), never a side effect of scaffolding.
- Fresh projects start with zero violations, zero locked blocks and three ID'd elements (Container, Stack, heading), which the template tests check.
