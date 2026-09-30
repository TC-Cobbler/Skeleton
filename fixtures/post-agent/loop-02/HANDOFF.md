# Handoff #5 — 2026-09-30 13:00

## Changes since last handoff
- Token changes: --radius-button calc(var(--radius) * 0.75) → calc(var(--radius) * 1); --radius-card calc(var(--radius) * 1.5) → calc(var(--radius) * 2)
- ui_ekjs6: pt-4 → pt-6; Previous/Next Stack ui_d5ne2 moved before the page text
- New elements: ui_7sig1 (Beta Badge in the action Stack), ui_nu5sf (Clear Button in the filter Stack ui_jfa7u)

## Tasks
- [x] ui_nu5sf · Behaviour · Resets the status filter to All and clears the search. Disabled when neither is active.
- [x] ui_crdt1 · Build · Title reads "Recent orders (N)" where N is the number of orders matching the current filter and search.

## Agent replies
<!-- Agent: tick tasks above and add replies here, keyed by data-ui-id -->
- ui_nu5sf · Calls clearFilters() from useOrderFilter(): sets the status filter to All and empties the search. Disabled via isFiltered, i.e. when the filter is All and the search is empty or whitespace-only (whitespace doesn't filter anything). Pagination goes back to page 1 as usual.
- ui_crdt1 · Title is "Recent orders ({visibleOrders.length})". N counts every order matching the filter and search across all pages, not just the rows on the current page.
- No new elements, IDs or tokens.
