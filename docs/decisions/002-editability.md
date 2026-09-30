# 002: Keep as much editable as is safe

**Status:** accepted · 2026-09-30 · follow-up to T0.3 / spike-log A2, A4

## Context

T0.3 locked any "logic-bearing" element, and anything inside a locked block was opaque. In the loop test, Behaviour tasks (`onClick`, `disabled={…}`, `variant={…}`) locked the very elements Skeleton had placed. Agent wrappers (a dialog component, a conditional, a `.map`) also swallowed Skeleton elements. By the end, 17 of 53 nodes on the page were locked, and Skeleton could no longer restyle its own buttons (PRD §16, "too much becomes locked").

The user's direction: keep as much editable as possible, as long as it's safe and doesn't break anything.

## What's safe

An edit is safe if it can't change agent logic:

- **Literal attributes.** Changing a literal attribute touches only that attribute's text. It can't change a handler, an expression or a sibling.
- **In-place edits under a locked parent.** Editing an element's own literal attributes, or inserting into it, doesn't change how a locked parent uses it. Moving it out, removing it or adding a sibling can: a dialog trigger, a conditional's single branch or a row template would then break or change meaning.
- **Removing logic.** Removing an element that carries logic deletes agent code, so it needs the user's explicit confirmation.

## Decision

1. **Protected props replace "logic-bearing ⇒ locked".** An element that is palette, primitive or plain stays that kind, and its non-literal props (plus `key`, `ref` and a non-literal `data-ui-id`) are listed in `protectedProps`.
   - `setProp` refuses a protected prop.
   - `setClass` refuses a non-literal `className`.
   - `remove` of an element whose subtree carries logic (locked blocks or protected props) requires `allowLocked`, which is the UI's confirmation.
2. **Locked blocks expose what they wrap.** A locked block's `children` are the JSX elements it wraps:
   - children of a custom component or fragment
   - conditional branches
   - the element a `.map()` callback returns, nested maps included

   These can be edited in place (`setProp`, `setClass`, `insert` into them). Because their parent is locked, `move` and `remove` refuse them, and nothing can be inserted as their sibling.
3. **Some things stay fully locked:**
   - custom components themselves
   - spread props (a spread can set any prop, `className` included)
   - member elements (`<Motion.div>`)
   - any other expression (`{render()}`, `{order.total}`)
4. **Attribute edits are text-level.** `setProp` and `setClass` replace only the attribute's value text, append after the last attribute, or delete the attribute with its leading whitespace. Recast reprinting a long opening tag had re-wrapped the agent's attributes onto new lines.

## Consequences

- In the Gate 0 project, every ID'd element except the one custom component is editable (53 of 55 before the nested-map fix, 54 of 55 after). The locked nodes that remain are the custom component, the conditional and map containers, and inline expressions that hold no editable elements.
- The Phase 3 UI has three states to show:
  - **Fully editable.**
  - **Editable in place** (the parent is locked): no drag out, no delete.
  - **Protected props:** shown read-only in the properties panel.
- Editing a `.map` row template restyles every row. That's intended, and consistent with A3 (one source element, many DOM nodes).
