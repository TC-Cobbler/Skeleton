# Choose the plain-language word for every concept

Type: grilling
Status: resolved
Blocked by: 01
Part of: [UI refresh map](../map.md)

## Question

For each jargon-flagged concept in the inventory (token, locked block, violation, override, pass, orphaned note, dev server, gap, font-size, etc.), what is the word Johnny sees on screen? Agent proposes, Johnny chooses. Record each resolved term in a new root `GLOSSARY.md`. Hand off / Take back stay as they are.

## Answer

Settled with Johnny over three rounds plus a confirmation, all on the recommended options. Every term is in the root [GLOSSARY.md](../../../GLOSSARY.md) (58 terms, each with the words to avoid).

**The main choices:**
- **Theme** (was tokens): "theme value", "app theme", "Light mode" / "Dark mode". Off-theme values have the actions "Use theme value", "Add to theme" and "Leave as is"; derived values "Follow" another, or have their "Own value".
- **Agent code** (was locked): its kinds are Repeated list, Shows sometimes, Agent value, Agent component, Group and Agent element. "Agent controls" replaces protected props, and "Agent is working" replaces the locked canvas.
- **Round** and **Agent's work** (was handoff # / pass), including "Rules the agent broke", "Fixed by Skeleton", "New agent code" and "Undo the agent's work". Hand off / Take back stay.
- **Element names** replace IDs in every everyday view.
- **Edit | Try it** (canvas modes), **Your app** / **App preview** (dev server), and **Add** (the palette).
- **Layout elements:** Column, Row, Grid, Page width, Push apart.
- **Layout settings:** Arrange, Space between items, Inner space, Line up, Spread, Wrap onto new lines.
- **Component names:** Text field, Text box, Menu, Side panel, Pop-up message.
- **Element settings** get curated labels, theme values get friendly names, and Selection's Kind row goes.
- **Right-hand tabs:** Element / Theme / Off-theme / Notes / Agent's work. Inside Element, the element's name is the heading, followed by "Settings" and "Layout" sections.
- **Pages:** "Page name" and "Web address", with no component names. View source becomes "Show code"; the version line and project path go to Advanced.

**Rules confirmed with Johnny:**
- Element names appear everywhere an ID used to.
- Undo/Redo descriptions use these words ("Change Style of Button 'Save'").
- The Hand off line becomes "Round 3: 2 open notes go to the agent as tasks."
- Errors, empty states and confirmations are left to [Rewrite messages and empty states in plain language](06-plain-messages.md).

**Not settled here:** the individual entries in the three lookup tables (theme value names, setting labels and option values, agent-controls names). They're ticketed as [Name every theme value, setting and agent control](08-name-tables.md).

