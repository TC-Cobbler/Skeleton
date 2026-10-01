# Map: UI refresh (plain language, Adobe-style)

Label: wayfinder:map

## Destination

A written **UI refresh spec** for Skeleton's own app (renderer + overlay chrome), sliced into a new TASKS.md phase ("v1.0.y — UI refresh") ready for a build session. The spec covers: plain-language vocabulary, regrouped Adobe-style layout, and a dark visual style. On-screen presentation only: no new features, no behaviour changes.

## Notes

- Domain: Skeleton's renderer UI (`packages/app-renderer`, overlay chrome in `packages/overlay`). ~14 panels today, labels steeped in dev jargon (tokens, data-ui-id, dev server, diff, violations, orphaned, contract breaches, locked blocks, Pass #n, overrides, font-size, gap).
- User: Johnny (PRD §4), does **not** know HTML or CSS. Every word on screen must make sense without that knowledge.
- Reference: Adobe-like app screenshot (`reference.png` in this folder) — a **loose** reference for look and layout only (dark chrome, tool rail, left Layers panel, tabbed right inspector, status bar). Its features are not in scope.
- Standing decisions (from charting):
  - Plan, don't build: the map ends at the spec + TASKS.md slicing.
  - Rename **and** hide plumbing **and** regroup panels into a few Adobe-style areas.
  - On-screen text only: files (`HANDOFF.md`, `skeleton/config.json`), git commit subjects, the project CLAUDE.md contract and `data-ui-id` keep their names; the UI just stops surfacing them in everyday views.
  - Dark chrome only. The project preview's own light/dark toggle is unchanged.
  - A status bar is allowed if it only shows information that already exists.
  - Judge look and layout by clicking throwaway HTML mocks, not by reading prose.
  - Agent-side words "Hand off" / "Take back" stay.
  - Resolved friendly terms go into a new root `GLOSSARY.md`.
- Skills: `grilling` + `domain-modeling` for vocabulary; `prototype` for layout/style; respect CLAUDE.md non-negotiable 6 (no deferred features).

## Decisions so far

## Not yet specified

- **How the restyle is built**: whether the renderer keeps plain `styles.css` with a token layer of its own, or adopts something else; icon source. Hangs on the visual style.
- **Test impact of renames**: which unit/e2e tests assert on visible text or `aria-label`s, and how the spec keeps them meaningful. Partly surfaced by the inventory.
- **Message tone**: empty states, errors, confirmations and toasts rewritten in plain language — may fold into the vocabulary ticket or need its own once the inventory shows how many there are.
- **Where "Advanced" lives**: the home for hidden plumbing (Dev server, View source, diffs, config acknowledgements) — shaped by the layout prototype.
- **The spec itself and TASKS.md slicing**: final write-up once vocabulary, layout and style are settled.

## Out of scope

- Features shown only in the reference screenshot: X/Y/W/H transform fields, opacity and blend modes, rulers and smart guides, voice-memo pins, cloud sync, "Present prototype", sharing for review. (CLAUDE.md non-negotiable 6.)
- A light theme for Skeleton's own chrome.
- Renaming files, commit subjects, agent contracts or `data-ui-id`.
- v1.1 work (ROADMAP.md).
