# Vendored code

`project/src/components/ui/*.tsx` and `project/src/hooks/use-mobile.ts` are copied from [shadcn/ui](https://github.com/shadcn-ui/ui) (`apps/v4/registry/new-york-v4`, MIT) by `scripts/vendor-shadcn.ts`. The upstream commit is in each file's first line.

Adaptations, all made by the script so a re-vendor reproduces them:

- Import paths point at the project (`@/lib/utils`, `@/components/ui/*`, `@/hooks/*`), and `"use client"` is dropped.
- Radius classes on the main components use per-component tokens (`rounded-button`, `rounded-input`, `rounded-card`, `rounded-dialog`, `rounded-popover`, `rounded-badge`; PRD §10.1). The script fails if upstream changes the number of occurrences it rewrites.
- `sonner.tsx` reads the theme from the `.dark` class on `<html>` (`useDocumentTheme`) instead of `next-themes`.

To update: `pnpm --filter @skeleton/templates vendor <path to a shadcn-ui/ui checkout>`, then review the diff.
