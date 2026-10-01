# Write the UI refresh spec and slice it into TASKS.md

Type: task
Status: open
Blocked by: 06, 07, 08, 09
Part of: [UI refresh map](../map.md)

## Question

With every decision on the map settled, write the **UI refresh spec** and slice it into a new **TASKS.md phase, "v1.0.y — UI refresh"**, ready for a build session. The spec covers:

- the vocabulary (`GLOSSARY.md` and the name tables)
- layout D
- the Compact pro style
- the message rewrites
- the build approach
- the test policy

The slices are small, gated by tests, and on-screen presentation only. The agent drafts both, and Johnny approves before this closes. This is where the map reaches its destination.

## Context from other tickets

- [Decide how tests keep up with renamed text](07-tests-and-renames.md): slice 1 of the phase is a pure refactor (copy files, test helpers, every test switched over, nothing visible changed).
