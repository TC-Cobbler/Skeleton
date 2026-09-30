# 007: Palette catalogue

**Status:** accepted · 2026-09-30 · T3.1

## Context

T3.1 needs the curated components and primitives from PRD §9.1, each with a typed prop schema (for the properties panel, T3.5) and a default JSX template (for `insert`, T3.2). The templates have to compile against the vendored shadcn components, and every element they create has to come out editable, with an ID.

## Decisions

**The catalogue lives in `@skeleton/templates` (`src/palette.ts`),** beside the vendored components it describes. It's pure data:

- `PALETTE`: the placeable entries, each with a template.
- `ELEMENTS`: a prop schema per element name.

Main serves both over `palette:list`, marking any entry the project can't place: the renderer still imports nothing from core or templates at runtime (ADR 003).

**Templates carry no IDs.** They're minted project-wide when an entry is placed (T3.2), then Prettier formats the template before `insert`.

**What a schema `default` means:** for enums, booleans and numbers it's what the component does when the prop is absent, so choosing it removes the attribute (e.g. Button `type` defaults to `submit`, as HTML does). For strings, `null` means optional; a string is a required prop's starting value and is never removed.

**Only literal props are in a schema:** enum, boolean, string and number. Classes (Stack gap, Grid columns) are layout properties, marked by `layout: "stack" | "grid"`; T3.5 edits them with `setClass`.

**`ELEMENTS` has exactly the elements the templates use.** A test enforces this, so every schema is covered by the typecheck test below. Agent-written palette parts outside that set (e.g. `CardFooter`) are still classified `palette` by the parser and are editable; they just get no prop controls.

**Availability is checked, not assumed.** An entry is available when every component its template uses is exported by the project module it's imported from. Older projects and fixtures (e.g. `fixtures/base`, which only has Button, Card and Table) show the rest greyed out, with the reason.

**Two §9.1 entries don't map to a placeable shadcn component:**

- **Form.** shadcn's `Form` is react-hook-form's `FormProvider`, which needs `useForm()` (agent logic, and a `{...form}` spread that would lock it). The palette's Form places a plain `<form>` of labelled fields and a submit button. The agent wires up validation and submit.
- **Toast.** Toasts are fired by code (`toast("…")`), and `<Toaster />` is already mounted in `main.tsx`. The entry is listed but can't be placed, and its note says what to do instead.

**Templates avoid mixed content.** A checkbox and its label sit in a horizontal Stack, not inside a `<Label>`: `insert` refuses text siblings, and text editing needs text-only children.

**Nothing placed is zero-sized.** An empty element renders 0px tall and can't be dropped into, so empty Stacks and Grids get padding (`p-4`, or `py-8` in Container), and a Card's or tab's content starts with a placeholder paragraph. Aiming at the text drops into its container.

## Consequences

- `templates/tests/palette-typecheck.test.ts` installs a real project and places every template once. For every schema prop and every value it allows (each enum option, both booleans, a sample string or number), it places a fresh copy with `setProp` applied. Then it runs `tsc -b`. A mutation check confirmed an invented enum option fails it.
- Changing a vendored component (re-vendor) can break a schema. The typecheck test catches it.
- Adding a palette component later (v1.1) means adding a template, schemas for its elements, and nothing else.
