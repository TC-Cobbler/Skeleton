# Name every theme value, setting and agent control

Type: grilling
Status: claimed
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

The vocabulary ticket settled that three things get curated plain names, not raw code names. It didn't choose the individual entries. What is each entry called on screen?

1. **Theme value names** for the scaffolded theme, about 30 values (e.g. `--primary` → "Main colour", `--radius-card` → "Card corners"), plus the fallback rule for values a user or agent adds.
2. **Setting labels and option values** for the 19 component settings and their values (e.g. `variant` → "Style", `destructive` → "Danger", `asChild` hidden).
3. **Agent-controls names** for the props agent code usually sets (e.g. `onClick` → "What happens on click", `value` → "Current value"), plus the fallback.

The agent proposes full tables from `packages/templates` and the scaffolded `globals.css`, and Johnny edits and approves them. The approved tables go into the spec. Terms already in `GLOSSARY.md` are the starting point.
