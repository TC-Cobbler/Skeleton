# Decide how tests keep up with renamed text

Type: grilling
Status: resolved
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

The inventory finds 140 UI texts that tests use to find or check things, across 12 e2e files and 2 renderer test files. A refresh will rename most of them. What's the policy?

- **Option 1:** update each query to the new text, so tests keep proving that the words on screen are right.
- **Option 2:** move queries to `data-testid` and roles, plus a few shared helpers (the picker labels repeat across 4–8 files).
- **Option 3:** a mix: text for the words that matter to Johnny, test IDs for the rest.

The decision shapes how the build phase is sliced and how big each slice's test diff is.

## Context from other tickets

- [Rewrite messages and empty states in plain language](06-plain-messages.md): core and app-main messages stay technical (reason codes are added alongside them), so their unit tests aren't affected. Only renderer and e2e tests meet the new sentences.

## Answer

Settled with Johnny in two grilling rounds (all recommendations taken).

1. **Finding things:**
   - E2e and renderer tests look things up by **role and visible name**, through one shared helper file of named lookups, e.g. `ui.workspace("Style")`, `ui.inspectorTab("Theme")`, `ui.setting("Space between items")`, `ui.createProject(name)`.
   - The helpers also cover the new layout's navigation (switching workspace and inspector tab).
   - `data-testid` stays for things without words: canvas frames, layer rows, handles.
2. **One copy file:**
   - All of the renderer's on-screen words live in one copy file, next to the message table from [Rewrite messages and empty states in plain language](06-plain-messages.md). Panels and the test helpers both read names from it.
   - The overlay has its own small copy file in its package, so it never imports from the host. Refusal sentences still come from the host's table.
3. **Plain-words check:**
   - A unit test reads both copy files and fails on any glossary *Avoid* word (whole words, not case-sensitive).
   - **Allowed exceptions:** the Details text, the Copy details block, the read-only page code view and the app preview log.
4. **Gate tests** (gate1–5, dogfood) are updated in place through the helpers. Their **steps and assertions stay the same**; only how they find things changes. Each build slice re-runs all of them.
5. **No pixel snapshots.** Each slice is checked by people from screenshots in its notes. Tooltips on hover and focus get ordinary behaviour tests.
6. **Renderer unit tests** that check text (`nodes.test.ts`, `mapping.test.tsx`) refer to copy-file entries. The "every reason code has a sentence" test sits beside them.
7. **Build order:** the first slice is a **pure refactor**:
   - create the copy files and test helpers
   - move today's words into them unchanged
   - switch every test to the helpers

   The UI stays unchanged and everything is green. Later slices only change words, layout or style, so their test diffs mostly sit in the helper file.

Core and app-main unit tests are untouched: their messages stay technical, as decided in the plain-messages ticket.
