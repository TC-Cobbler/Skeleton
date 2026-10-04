# Prototype the regrouped Adobe-style layout

Type: prototype
Status: resolved
Blocked by: 01
Part of: [UI refresh map](../map.md)

## Question

How should today's ~14 panels regroup into a few Adobe-style areas (tool rail, left Layers/Pages, centre canvas, tabbed right inspector, status bar), and where does hidden plumbing live? Build a rough clickable dark HTML mock using today's real features only (see `reference.png` as a loose guide) and iterate with Johnny until the arrangement is approved. Placeholder words are fine; vocabulary is settled separately.

## Answer

Approved by Johnny: **layout D**, a mix of C's workspaces, A's tabbed inspector and B's hand-off bar. It was chosen by clicking a mock of four arrangements of today's real features, using the vocabulary in `GLOSSARY.md`.

**Assets:**
- Clickable mock (published, private): https://claude.ai/artifact/MhsieMN8riB41eGysyaSCC. Version 3 is the approved one; it opens on D, and A–C remain for comparison.
- Source: [prototypes/layout-prototype.html](../prototypes/layout-prototype.html). It's a throwaway prototype, not app code. It's kept in this scratch folder because this session can only push its own branch.

**The approved arrangement:**
- **Top bar:**
  - the project name;
  - the page picker ("Page: Library ▾"), which replaces the Pages panel; add, rename and delete live in its menu;
  - the workspaces **Build | Style | Hand off**;
  - Undo / Redo;
  - a **⋯ menu** holding Advanced: App preview and its log, Show code, About.
- **Left panel, changing by workspace:**
  - **Build:** Add / Layers tabs.
  - **Style:** Layers, plus the handle-reach hint.
  - **Hand off:** every note, plus Notes without an element.
- **Centre:** the canvas toolbar (Edit | Try it, preview widths, App theme Light | Dark) and the canvas. Under it is the **hand-off bar**: With you / Agent is working · round · open notes · Hand off / Take back · "Review the agent's work".
- **Right:** the **tabbed inspector**, the same in every workspace: Element / Theme / Off-theme / Agent's work.
  - Each workspace opens its natural tab: Build on Element, Style on Theme, Hand off on Agent's work.
  - Selecting an element always shows Element.
  - The Element tab ends with **that element's notes** and the add-note form.
- **Status bar:** "Your app is running" and what the current workspace is for. No plumbing.

**Settled along the way:**
- Theme is an inspector tab, so the Style workspace's left side shows Layers rather than a second copy of the theme.
- Notes appear in both places: the full list in the Hand off workspace, and per element on the Element tab.
- Advanced sits behind the ⋯ menu, not in a status-bar drawer.

