# Pathological fixtures

Hand-written worst cases for `core`. Add one for every bug in `docs/spike-log.md` or `docs/dogfood-log.md`, and never delete them.

- `agent-page.tsx`: agent-style page with a generic hook, odd formatting, JSX comments, an inline handler, `.map()` and conditional blocks, a custom component and an empty self-closing Stack.
- `post-agent-pass1.tsx`: HomePage after spike loop round 1 (spike-log S2). A Skeleton button wrapped by the agent in a custom `<NewOrderDialog>` (locked, no ID); moving that multi-line block used to break its indentation.
- `template-literal-block.tsx`: a locked block containing a multi-line template literal, whose indentation is string content and must not change on move (spike-log S2).
- `post-agent-pass4.tsx`: HomePage after loop round 4. It doesn't import `Input`, so inserting one used to break the build (spike-log S5).
