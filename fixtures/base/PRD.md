# PRD: Orders admin (Skeleton fixture)

A small internal admin app for a shop. One page for now, `/` (Orders), which lists recent orders in a table with actions to create and export orders.

There's no backend yet. When a task needs data, use a typed in-memory mock behind a hook in `src/hooks` (e.g. `useOrders()`), shaped so it could later call `/api/orders`.
