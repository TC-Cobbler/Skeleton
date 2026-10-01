# Rewrite messages and empty states in plain language

Type: grilling
Status: claimed
Blocked by: 02
Part of: [UI refresh map](../map.md)

## Question

Using the inventory's message rows (about 80 main/core messages that reach a toast, plus the renderer's empty states, confirmations, progress lines and refusal reasons) and the vocabulary from ticket 02: what does each kind of message say to Johnny, and where is the plain wording produced?

- **Option 1:** reword at the source (core, app-main), which changes the messages that unit tests assert on.
- **Option 2:** map known error kinds to plain text in the renderer, keeping the technical message behind an "Advanced"/details affordance.

Decide the approach and the tone rules, and write a representative set of rewrites (one per message family).
