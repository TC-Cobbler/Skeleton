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

- [Inventory every user-visible string and control](issues/01-inventory-ui-surface.md): about 260 visible strings plus palette, property and main/core messages are catalogued in [inventory.md](inventory.md), with jargon flags, everyday/occasional/plumbing panels, a concept hot list, and 140 texts tests query by.
- [Choose the plain-language word for every concept](issues/02-plain-vocabulary.md): 58 terms in GLOSSARY.md. Theme / Off-theme, Agent code (and its kinds), Round / Agent's work, element names instead of IDs, Edit | Try it, Your app, Add, Column / Row and plain layout settings. (Its tab list is superseded by the layout ticket.)
- [Prototype the regrouped Adobe-style layout](issues/03-layout-prototype.md): approved layout D. Build | Style | Hand off workspaces with a per-workspace left panel, a page picker, a tabbed inspector (Element / Theme / Off-theme / Agent's work) with element notes inline, a hand-off bar under the canvas, Advanced in a ⋯ menu, and a status bar.
- [Settle the dark visual style](issues/04-visual-style.md): Compact pro. 12px system text, small uppercase panel headings, near-black separators, #1B1B1B panels, one blue (#4069FD) for selection, focus and the active workspace; icon-only toolbar buttons with tooltips on hover and focus, words kept for workspaces and anything to do with the agent or project.
- [Research Adobe's public design conventions for dark desktop apps](issues/05-adobe-spectrum-research.md): Spectrum 2 dark greys (#111 canvas, #1B1B1B panels), single blue accent #4069FD, system font at 14px, 32px controls, 260px panels, icon buttons need tooltips; on-screen text says what a control does.
- [Rewrite messages and empty states in plain language](issues/06-plain-messages.md): core and main keep technical messages and add reason codes; the renderer turns them into plain sentences from one table, with Details and Copy details (for the agent). Three tiers: refusal, problem with an action, and a catch-all for Skeleton faults. Disabled controls reuse the same sentence. Six tone rules and approved rewrites per family.
- [Decide how tests keep up with renamed text](issues/07-tests-and-renames.md): tests find things by role and visible name through one helper file; the renderer and overlay each keep their words in a copy file, checked by a test against the glossary's Avoid words. Gate tests are updated in place with the same steps and checks, there are no pixel snapshots, and the first build slice is a pure refactor with nothing visible changed.

## Not yet specified

_Nothing left in the fog: every remaining question is a ticket._


## Out of scope

- Features shown only in the reference screenshot: X/Y/W/H transform fields, opacity and blend modes, rulers and smart guides, voice-memo pins, cloud sync, "Present prototype", sharing for review. (CLAUDE.md non-negotiable 6.)
- A light theme for Skeleton's own chrome.
- Renaming files, commit subjects, agent contracts or `data-ui-id`.
- v1.1 work (ROADMAP.md).
