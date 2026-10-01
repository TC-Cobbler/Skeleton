# Decide how tests keep up with renamed text

Type: grilling
Status: open
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
