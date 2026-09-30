# CLAUDE.md

This project's UI is managed with **Skeleton**, a visual editor that round-trips code with you. The user arranges layout and design tokens in Skeleton, and you build features and logic. You both edit the same files, turn by turn. The rules below keep that working. **Breaking them loses the user's work or yours.**

Your tasks for this pass are in `HANDOFF.md`.

---

## Round-trip contract

### 1. Never remove or change a `data-ui-id`
- Every JSX element you create gets an ID in the same format: `ui_` + 5 lowercase alphanumerics (e.g. `ui_k3m9x`), unique within the project.
- Before minting an ID, search the project to make sure it's unused.
- Wrapping an element (e.g. in a conditional, a provider or a dialog trigger) keeps the ID on the original element. A wrapper *component* you write around it (`<OrderDialog>…</OrderDialog>`) is a new element, so it gets its own new ID too.

### 2. Style only with tokens
- Use Tailwind classes that map to `@theme` tokens: `rounded-card`, `p-4`, `text-lg`, `bg-primary`, and so on.
- **Not allowed:** inline `style={}`, arbitrary values (`rounded-[14px]`, `p-[13px]`, `bg-[#ff0000]`), and hard-coded colours anywhere.
- Responsive styles are **desktop-first**. Base classes describe the desktop layout; smaller screens use `max-lg:`, `max-md:` and `max-sm:`.

### 3. Don't edit design tokens
- `src/styles/globals.css` tokens are owned by Skeleton. Don't change them.
- If you need a new token, request it under **Agent replies** in `HANDOFF.md`.

### 4. Keep layout in primitives
- Use `Stack`, `Grid`, `Container` and `Spacer` from `src/components/layout` for layout, not ad-hoc flex or grid `div`s. Stack direction is a prop (`direction="horizontal"`, vertical by default); gap, padding, alignment and grid columns go in `className`.
- Use the shadcn components in `src/components/ui` wherever one fits.

### 5. Isolate logic from layout
- Put data fetching, state and effects in hooks (`src/hooks`) or in wrapper components.
- Keep page files mostly JSX layout, so the user can keep editing them visually.

### 6. Don't restructure the scaffold
- Don't move or rename the router file, `src/pages`, `src/components/ui`, `src/components/layout`, or `/skeleton`.
- Never edit files in `/skeleton`.

### 7. Report back in `HANDOFF.md`
- Tick every task you completed: `- [x]`.
- Add replies under **Agent replies**, keyed by `data-ui-id`:
  ```
  - ui_7f3k2 · Loads from /api/orders via useOrders(); empty state needs design
  ```
- List any new elements you added that the user should know about.

---

## Stack

- Vite
- React
- TypeScript
- Tailwind v4
- shadcn/ui
- React Router

## Project docs

- `PRD.md` covers what the app is.
- `TASKS.md` tracks progress.
- `ROADMAP.md` covers what's later.
