# Settle the dark visual style

Type: prototype
Status: resolved
Blocked by: 03, 05
Part of: [UI refresh map](../map.md)

## Question

On top of the approved layout mock: what colours, typography, spacing density, panel headers, icons (icon + label vs icon + tooltip in the tool rail) and selection/focus treatments make Skeleton feel like an Adobe app? Iterate the mock with Johnny until approved, informed by the Adobe Spectrum research.

## Answer

Approved by Johnny: **style 1, Compact pro**, on the approved layout D, chosen from three styles in a clickable mock. Confirmed with the tooltip rule below.

**Assets:**
- Clickable mock (published, private): https://claude.ai/artifact/CLNPoycX1SPcib24SX4dju. It opens on Compact; Regular and Darkest remain for comparison.
- Source: [prototypes/style-prototype.html](../prototypes/style-prototype.html). It's a throwaway prototype; see the `.st-compact` rules.

**Colours.** Dark only; values are from [the Adobe research](05-adobe-spectrum-research.md):

| Role | Value |
|---|---|
| Preview surround | `#111111` |
| Panels, bars, status bar | `#1B1B1B` |
| Toolbars, pop-overs, menus | `#222222` |
| Control fill / hover | `#2C2C2C` / `#393939` |
| Separators between panels | 1px `#111111` (near-black) |
| Text: headings / body / secondary | `#F2F2F2` / `#DBDBDB` / `#8A8A8A` |
| Inputs | fill `#111111`, border `#444444` |
| Accent (one blue) | `#4069FD` |
| Selected layer | blue at 16% plus a 2px blue left edge |
| Agent code | `#E8833A` |
| Notes | `#C084FC` |
| Tooltips | `#6D6D6D` with white text |

**Type and density:**
- System UI font (`ui-sans-serif, system-ui, sans-serif`), **12px** body text.
- Small **uppercase** panel headings (10px, letter-spaced) and 11px tabs.
- 34px bars, compact controls (about 24px tall, 3px radius on fields), tight list rows.

**Icons:**
- Outline icons, 1.5px stroke, rounded caps and joins, on a 20px canvas (16px in lists).
- **Icon-only** in the canvas toolbar (Edit / Try it, preview widths, light/dark) and the top bar (Undo / Redo, ⋯).
- **Words are kept** on the workspace buttons (Build / Style / Hand off), Hand off / Take back, and anything to do with the agent or the project.

**Tooltip rule (confirmed):** every icon-only button shows its plain-language label on hover **and on keyboard focus**, in the 12px Spectrum style.

**Selection and focus:**
- Blue only for the selected layer, the canvas selection outline and handles, the active workspace, Hand off, and a **2px focus ring with a 2px gap**.
- Toggles and tabs that are on use grey (`#444` fill / light text). The selected tab has a blue 2px underline.

