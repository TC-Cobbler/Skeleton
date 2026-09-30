# 010: Tokens and gizmos

**Status:** accepted · 2026-09-30 · T4.1–T4.7 (applies to all of Phase 4)

## Context

Phase 4 edits the design system from the canvas: a token panel, a map of what each token affects, on-canvas handles with live feedback, and three scopes per drag (PRD §10). Constraints:

- **Non-negotiable 5:** only the token writer writes `globals.css`.
- **ADR 003 and 006:** the renderer and the overlay never import `core` at runtime. Everything that needs CSS or Tailwind knowledge is worked out in main and sent as data.
- Tokens in `@theme inline` (per-component radii, the type scale) are inlined into utilities by Tailwind. There's no `--radius-button` variable at runtime to set.

## Decisions

**The token panel (T4.1) reads `readTheme` in core.** It gives one entry per token, with its light and `.dark` values, its formula's references, and what it comes to (`calc` evaluated by `calc.ts`: lengths, numbers and `var()`, nothing layout-dependent).

- **Plumbing isn't listed:** `--color-x: var(--x)` and `--default-border-width` only hand a token to Tailwind.
- **Detach** writes the resolved literal. **Attach** writes the template's formula (`templateTokens()`), so a token is "detached" exactly when the template has a formula for it and the project doesn't.
- **Writes** go through `tokens:write` → `Editor.tokens` → `setTokens` → `writeTokens`. They're queued with page edits and undoable, and not typechecked (CSS can't break `tsc`). Values are one line of CSS with no `;{}` or comments.

**What a token affects (T4.2) is worked out in core and matched in the page.** `tokenUsage(css)` gives, per token, regexes for the base utilities that read it (Tailwind v4 namespaces: `--color-*`, `--radius-*`, `--text-*`, `--font-*`, `--spacing`, `--default-border-width`), through every token derived from it. It also gives the base-layer selectors styled with it (`body`), and makes every bordered element depend on `--border` (`* { @apply border-border }`).

- The overlay strips variants from each DOM class (`hover:bg-primary/90` → `bg-primary/90`) and counts matching elements. That includes shadcn internals and agent components, which only the DOM shows.
- It re-counts on DOM changes, and reports only when the counts change.

**Gizmos are planned in the overlay, from what it measures (T4.3).** `gizmos.ts` is pure:

- **Inputs:** the selected element's box, its unvaried classes and its computed styles, plus the tokens in the mode shown, the spacing scale and whether its classes can be edited, all sent by the host per selection.
- **Outputs:** handles, and for a drag a stylesheet to preview with and a commit.
- **Which handles:** radius on anything; gap and padding only on layout containers (nodes the host marks `drop`: a Button is inline-flex with padding, but it isn't a stack); a baseline on elements with their own text; an edge on bordered elements; a chip per colour utility that reads a colour token.

**Scopes (T4.5, PRD §10.3):**

| Handle | Plain drag | Shift | Alt |
|---|---|---|---|
| Radius | The element's `--radius-x` (from its `rounded-x` class). An attached token keeps its formula: only the factor in `calc(var(--radius) * k)` changes. | `--radius`, set so this element lands where dragged | `rounded-[Npx]` |
| Gap, padding | A step on the spacing scale (`gap-6`): a token-conforming class, not a violation | `--spacing`, scaled from the element's step | `gap-[Npx]` |
| Type | A step on the type scale (`text-lg`), one per 12px | `--type-base`, scaled | `text-[Npx]` |
| Border width | `--border-width`: there are no per-component widths, so plain and Shift are the same | `--border-width` | `border-[Npx]` |
| Colour | The token, in the mode shown (T4.7) | — | `bg-[#hex]` |

- Spacing and type have no component tokens in v1 (PRD §10.1), so "component" means a step on the project's scale.
- Class edits replace the element's classes in the same group (a regex per group that never catches `text-primary` or `border-input`), with one `setClass`. They need an ID and a literal `className`; otherwise the scope says why it's unavailable.
- The hover label names the scope before the drag and follows Shift and Alt.

**Live preview (T4.4) is one injected stylesheet, and no file is written until release.**

- Runtime variables (`:root`, `.dark`, `@theme`) are previewed with `:root{--x:v!important}`, which beats `.dark{}`.
- Inlined tokens are previewed by overriding their utility (`.rounded-button{border-radius:…}`).
- Instance and step edits target the element through a temporary `data-skeleton-gizmo` attribute.
- **On release** the overlay posts `gizmo-commit`, and the renderer writes it through `tokens:write` or `page:edit`. The preview stays until Vite's next update (the written value is then on the page), so nothing flickers back. It goes at once if the write fails, and after a timeout at the latest.
- The colour picker previews the same way (`preview`), and writes when the native picker closes (`change`, not React's `onChange`).

**Violations (T4.6) are described in core, fixed through the editor.**

- `describeViolations` gives each violation from `findViolations` its element, its property, the nearest token and what it can be promoted to.
  - **Element:** the innermost page element containing it.
  - **Nearest token:** lengths go through `calc.ts` with rem counted as 16px. Colours are compared in OKLab (`colour.ts`) against the light colour tokens. Tailwind palette colours such as `bg-red-500` get their values from the project's own `node_modules/tailwindcss/theme.css`.
- **Only a class in the literal `className` of an editable, ID'd element can be fixed.** Anything else (agent code, inline `style`) can only be kept. Scaffold code (`src/components/ui`, `layout`) is exempt, as on take-back.
- **Snap** is a `page:edit` `setClass`, keeping variants (`hover:bg-[#f00]` → `hover:bg-destructive`).
- **Promote** creates `--radius-x`, `--text-x`, `--spacing-x`, or a colour (`--x` light and dark, plus `--color-x`) through the token writer. It then swaps the class, as one undoable step across `globals.css` and the page. Border widths and inline styles can't be promoted: v1 has no named-width namespace.
- **Keep** appends `{ file, id, value }` to `acknowledgedViolations` in `skeleton/config.json` (undoable). The list marks kept items rather than dropping them.
- Fixes re-find the violation by file, offset and text first, and refuse if the list was stale.

**Colour edits follow the mode on screen (T4.7).** The picker and the token panel write `.dark` while the canvas shows dark, and `:root` otherwise. The preview is `:root{--x:…!important}`, which wins over `.dark` in dark mode too.

## Consequences

- Handles live in the overlay's shadow root with `pointer-events: auto`. The drag captures the pointer on the document element, because handles are redrawn every frame.
- The picker's hex is written as oklch (`hexToOklch`), keeping the token's alpha, so `globals.css` stays in one colour space.
- e2e: `e2e/tokens.test.ts` and `e2e/gate4.test.ts`. Gizmo drags wait for any previous preview to clear first: handles move as a written value lands.

## Amendment: what Gate 4 turned up

- **An instance radius has to win over the component's own.** shadcn components merge `className` with `cn()` (tailwind-merge), which only knows t-shirt-size radius names. So `rounded-button rounded-[14px]` kept both classes, and Tailwind's CSS order let `rounded-button` win: the Alt-drag preview showed the change, then it reverted once written. The scaffold's `cn` now extends tailwind-merge to treat any named radius (`button`, `card`, and promoted ones like `hero`) as a radius, so a later override replaces it.
  - Projects scaffolded before this keep the old `cn`, and there an instance radius can lose to the component token.
  - Promoted `--text-*` names are still unknown to tailwind-merge (it reads `text-lead` as a colour). They're applied as classes, so a promoted size only conflicts with an explicit `text-sm` on the same element.
- **A gizmo drag ends on release, not on a move without buttons.** Chromium sends synthetic `pointermove`s after layout changes (which the live preview causes), sometimes without the pressed button or the modifiers. Cancelling on those dropped drags mid-way. The drag now ignores them, and ends on `pointerup`, on losing pointer capture (released outside the frame), on `pointercancel`, on blur, or on Escape.
