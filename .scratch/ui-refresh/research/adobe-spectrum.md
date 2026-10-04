# Adobe Spectrum: dark desktop app conventions

Research for [ticket 05](../issues/05-adobe-spectrum-research.md). This is input for the visual-style ticket. It records values and patterns we can borrow. It does not cover brand assets, logos or names.

## Sources and how they were read

`spectrum.adobe.com`, `react-spectrum.adobe.com`, `opensource.adobe.com` and `developer.adobe.com` (UXP docs) are **blocked by this session's network proxy**. Everything below therefore comes from Adobe's own public GitHub repos, read at these pinned commits:

| Short name | Repo @ commit | What it holds |
|---|---|---|
| **SDD** | [adobe/spectrum-design-data @ 3efcb12](https://github.com/adobe/spectrum-design-data/tree/3efcb12b887dcece4cfa999ebeca05eeefc65564) (renamed from `spectrum-tokens`, 30 Sep 2026) | Spectrum 2 (S2) design tokens (`packages/tokens/src/*.json`), plus a Markdown export of the S2 guideline pages (`docs/s2-docs/**`, each with a `source_url` on `s2.spectrum.corp.adobe.com`) |
| **SCSS** | [adobe/spectrum-css @ 3762086](https://github.com/adobe/spectrum-css/tree/37620864c60c4c142a506017e1a15348a26abb0e) | Component CSS; `components/*/themes/spectrum-two.css` maps S2 tokens onto components |
| **RS** | [adobe/react-spectrum @ 57c56b8](https://github.com/adobe/react-spectrum/tree/57c56b8cbfa65294fbaed528ab9580ade0d339cb) | S2 style macro (`packages/@react-spectrum/s2`) and the legacy Spectrum 1 dark/darkest variables (`packages/@adobe/spectrum-css-temp/vars`) |

Token values were resolved by following the alias chains in `color-palette.json` → `semantic-color-palette.json` / `color-aliases.json` → component files, using the `dark` and `desktop` sets. Where a value is an alias, the chain is shown as `token → gray-NN`.

---

## 1. Dark theme colour values (Spectrum 2)

### 1.1 The gray ramp (dark set)

Source: SDD `packages/tokens/src/color-palette.json`.

| Token | Dark value | Hex |
|---|---|---|
| gray-25 | rgb(17,17,17) | `#111111` |
| gray-50 | rgb(27,27,27) | `#1B1B1B` |
| gray-75 | rgb(34,34,34) | `#222222` |
| gray-100 | rgb(44,44,44) | `#2C2C2C` |
| gray-200 | rgb(50,50,50) | `#323232` |
| gray-300 | rgb(57,57,57) | `#393939` |
| gray-400 | rgb(68,68,68) | `#444444` |
| gray-500 | rgb(109,109,109) | `#6D6D6D` |
| gray-600 | rgb(138,138,138) | `#8A8A8A` |
| gray-700 | rgb(175,175,175) | `#AFAFAF` |
| gray-800 | rgb(219,219,219) | `#DBDBDB` |
| gray-900 | rgb(242,242,242) | `#F2F2F2` |
| gray-1000 | rgb(255,255,255) | `#FFFFFF` |

S2 has **one dark theme**. It merges Spectrum 1's "dark" and "darkest" because users found dark "too light and muddy" and darkest "too high-contrast … for long periods" (SDD `docs/s2-docs/designing/grays.md`, source_url `…/page/grays/`).

### 1.2 Background layers: what goes where

Source: SDD `color-aliases.json`. Usage text comes from SDD `docs/s2-docs/designing/background-layers.md`.

| Role | Token chain | Dark hex |
|---|---|---|
| Base (darkest; primary background) | background-base-color → gray-25 | `#111111` |
| Pasteboard (area behind the artboard) | background-pasteboard-color → gray-25 | `#111111` |
| Layer 1 | background-layer-1-color → gray-50 | `#1B1B1B` |
| Layer 2 (canvas / app frame) | background-layer-2-color → gray-75 (dark) | `#222222` |
| Elevated (floating toolbars, popovers) | background-elevated-color → gray-75 | `#222222` |

Guidance, quoted from background-layers.md:
- "Layer 1 can be used as the app frame color in **professional editing applications**, which require additional depth differentiation."
- "Layer 2 is the color of the canvas … can also be used … in the app frame, to put it on the same dimension as the primary content."
- "The pasteboard has a dedicated background layer … no components are placed directly on top of it, with the exception of an artboard."
- "In dark theme, the primary background (using the background base layer) is the darkest color."

**For an editing app like Skeleton:** the preview surround is the pasteboard (`#111111`), the panels and app frame are layer 1 (`#1B1B1B`) or layer 2 (`#222222`), and floating things are elevated (`#222222` plus a shadow, see §1.6).

### 1.3 Text and icon colours

| Role | Token chain | Dark hex |
|---|---|---|
| Headings / titles | heading-color, title-color → gray-900 | `#F2F2F2` |
| Body text | body-color → gray-800 | `#DBDBDB` |
| Default control content (labels, icons) | neutral-content-color-default → gray-800 | `#DBDBDB` |
| Same, hover / down / key-focus | neutral-content-color-hover → gray-900 | `#F2F2F2` |
| Secondary / subdued content (e.g. unselected tabs) | neutral-subdued-content-color-default → gray-700 | `#AFAFAF` |
| Detail / caption text | detail-color → gray-600 | `#8A8A8A` |
| Disabled content | disabled-content-color → gray-400 | `#444444` |

Source: SDD `color-aliases.json`, `body.json`, `heading.json`, `detail.json`.

### 1.4 Borders and dividers

| Role | Value (dark) | Source |
|---|---|---|
| Popover border | popover-border-color → gray-400 `#444444` | SDD `popover.json` |
| Action bar border | gray-400 `#444444` | SDD `action-bar.json` |
| Text field border default / hover / focus | gray-500 `#6D6D6D` / gray-600 `#8A8A8A` / gray-800 `#DBDBDB` | SCSS `components/textfield/themes/spectrum-two.css` |
| Text field background | gray-25 `#111111` | same file |
| Disabled border | disabled-border-color → gray-300 `#393939` | SDD `color-aliases.json` |
| Tabs divider line | gray-200 `#323232` | SCSS `components/tabs/themes/spectrum-two.css` |
| Divider thickness | small 1px, medium 2px, large 4px | SDD `divider.json` |
| Border widths | border-width-100 1px, -200 2px (-400 4px only in long-form docs) | SDD `layout.json`; object-styles.md says "large borders aren't used within in-product UI contexts" |

The grays.md page says field borders "stay gray-300 in the default state". The current spectrum-css S2 theme sets gray-500. **Treat the CSS (gray-500) as authoritative**: it is what ships.

S2 spacing guidance: "**instead of dividers, spacing is used as the primary way to group and divide content**" (SDD `docs/s2-docs/designing/spacing.md`). Use borders only "when spacing isn't enough", for example "separating a panel … from the rest of the content" (object-styles.md).

### 1.5 Accent, selection and focus

Accent is blue (`accent-color-NNN → blue-NNN`, SDD `semantic-color-palette.json`).

| Role | Token chain | Dark hex |
|---|---|---|
| Accent fill (default) | accent-background-color-default → blue-800 | `#4069FD` |
| Accent fill hover / down / key-focus | → blue-700 | `#345BF8` |
| Accent text / icon (links, emphasized tab) | accent-content-color-default → blue-900 | `#5681FF` |
| Accent visual (graphics) | accent-visual-color → blue-900 | `#5681FF` |
| **Focus ring** | focus-indicator-color → blue-800 | `#4069FD` |
| Focus ring thickness / gap | focus-indicator-thickness 2px, focus-indicator-gap 2px | SDD `layout.json` |
| Text on accent fill | white | SCSS actionbutton `index.css` (emphasized selected) |

Selected rows in **tree view (Layers-like)** come from SDD `tree-view.json`:
- Default (not emphasized) selected row: gray-100 `#2C2C2C`. Hover also gray-100.
- Emphasized selected row: blue-800 `#4069FD` at **10% opacity**, 15% on hover.
- Spectrum CSS uses gray-100 for tree-view item hover/focus (SCSS `components/treeview/themes/spectrum-two.css`).

Table selected row: blue-800 at 10% / 15% hover (SDD `table.json`).

Selection guidance, from SDD `docs/s2-docs/designing/states.md`:
- "Selected states use a primary style by default, generally through a gray-800 fill." In dark, that is a near-white fill (`#DBDBDB`) with dark content (gray-50) on toggled action buttons (SCSS actionbutton `spectrum-two.css`).
- An accent option exists "to draw emphasis". "When there's many groups of controls that require the same amount of attention (such as in a panel) the not emphasized option works best."
- Action button doc: "The emphasized action button has a blue background for its selected state … This is optimal for when the selection should call attention, **such as within a tool bar**." Non-emphasized is "optimal … in application panels, where all the visual components are monochrome in order to direct focus to the content" (SDD `docs/s2-docs/components/actions/action-button.md`).
- Keyboard focus "takes the button's visual hover state and adds a blue ring" (same file).

**Implication for Skeleton:** keep panels monochrome. Use blue only for the active tool in the tool rail (emphasized), for the focus ring, and for the selected layer and canvas selection (blue at 10–15% fill, or a solid blue outline on the canvas).

### 1.6 Status colours and shadows

- Negative (error) content: red-900 `#FC432E`, fill red-800 `#DF3422`. Notice/warning visual: orange-900 `#E06400`. Positive visual: green-900 `#099D59`. Informative: blue-900 `#5681FF`. Source: SDD `color-aliases.json`.
- Elevated drop shadow (popovers, menus, floating panels) has three layers. Source: SDD `color-aliases.json` `drop-shadow-elevated`:
  `0 4px 12px rgba(0,0,0,.24), 0 2px 6px rgba(0,0,0,.12), 0 0 2px rgba(0,0,0,.36)`.
- "By default, objects have no drop shadows". Shadows are for content on top of other content (menus, tooltips) and for dragged items (object-styles.md).

### 1.7 Reference: Spectrum 1 "dark" and "darkest" (legacy pro-app look)

The older desktop apps were built on S1's dark and darkest themes. Values come from RS `packages/@adobe/spectrum-css-temp/vars/spectrum-dark.css` and `spectrum-darkest.css`:

| | gray-50 | 75 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | blue-800 (focus/accent) | selected highlight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 dark | `#1D1D1D` | `#262626` | `#323232` | `#3F3F3F` | `#545454` | `#707070` | `#909090` | `#B2B2B2` | `#D1D1D1` | `#EBEBEB` | `#FFFFFF` | `#54A3F6` | rgba(84,163,246,.15) |
| S1 darkest | `#000000` | `#0E0E0E` | `#1D1D1D` | `#303030` | `#4B4B4B` | `#6A6A6A` | `#8D8D8D` | `#B0B0B0` | `#D0D0D0` | `#EBEBEB` | `#FFFFFF` | `#4096F3` | rgba(64,150,243,.20) |

In both S1 files, the app-frame border and separator colour is gray-50, the darkest gray (`--spectrum-alias-appframe-border-color`). S1's accent blue is lighter and more cyan than S2's indigo-ish `#4069FD`. Either reads as "Adobe-like", but S2 is the current direction.

---

## 2. Type

- **Font:** S2's default is "Adobe Clean Spectrum VF" (SDD `typography.json` `sans-serif-font-family`; SDD `docs/s2-docs/designing/fonts.md`). These are **"restricted fonts for the exclusive use of Adobe products"** (fonts.md), so **Skeleton must not ship them.** React Spectrum's own fallback stack is `adobe-clean-spectrum-vf, adobe-clean-variable, adobe-clean, ui-sans-serif, system-ui, sans-serif` (RS `packages/@react-spectrum/s2/style/spectrum-theme.ts` `fontFamily.sans`). Skeleton should use the tail of that stack: **`ui-sans-serif, system-ui, sans-serif`**. Code font: `source-code-pro, "Source Code Pro", Monaco, monospace` (same file). Source Code Pro is open-licensed ([adobe-fonts/source-code-pro](https://github.com/adobe-fonts/source-code-pro)).
- **Base UI size: 14px on desktop** (`--s2-font-size-base: 14`; RS `packages/@react-spectrum/s2/src/page.macro.ts`). Component text: `component-m-regular` = font-size-100 (14px) with an 18px line height, and `component-s-regular` = 12px/16px (SDD `typography.json`).
- **Font-size ramp, desktop (mobile):** 25 = 10 (12) · 50 = 11 (13) · 75 = 12 (15) · 100 = 14 (17) · 200 = 16 (19) · 300 = 18 (22) · 400 = 20 (24) · 500 = 22 (27) · 600 = 25 (31) · 700 = 28 (34) · 800 = 32 (39) · 900 = 36 (44) · 1000 = 40 (49). Source: SDD `typography.json`.
- **Line heights** for small sizes: 11px→14, 12px→16, 14px→18, 16px→20, 18px→22 (SDD `typography.json` `line-height-font-size-*`). Generic line-height tokens: 1.3 (100) and 1.5 (200).
- **Weights:** regular 400, medium 500, bold 700, extra-bold 800 (RS `spectrum-theme.ts` `fontWeightBase`). Title = bold, heading = extra-bold, detail = medium (SDD `title.json`, `heading.json`, `detail.json`). Tabs use regular weight in S2 (SCSS tabs `spectrum-two.css`).
- **Named sizes useful for panels:** title-size-s 14px (the **standard panel title**: `standard-panel-title-font-size → title-size-s`, SDD `standard-panel.json`), title-size-xs 12px, detail-size-s 12px, detail-size-xs 11px, body-size-s 14px, body-size-xs 12px. The tooltip font is 12px regular (SCSS `components/tooltip/index.css`).

---

## 3. Spacing, density and scale

- **Two platform scales.** Desktop ("medium") is the 1× base. Touch ("large") is **1.25×**. React Spectrum switches with `@media not ((hover: hover) and (pointer: fine)) { --s2-scale: 1.25; --s2-font-size-base: 17 }` (RS `page.macro.ts`). The tokens carry `desktop` and `mobile` values; for example, component-height-100 is 32px on desktop and 40px on mobile (SDD `layout.json`). S1 had the same split, named medium and large: size-400 = 32px vs 40px, font-size-100 = 14px vs 17px (RS `spectrum-css-temp/vars/spectrum-medium.css` and `spectrum-large.css`). **Skeleton is a mouse-driven desktop app, so it uses desktop/medium.**
- **Spacing scale (px):** 50 = 2 · 75 = 4 · 85 = 6 · 100 = 8 · 200 = 12 · 300 = 16 · 350 = 20 · 400 = 24 · 500 = 32 · 600 = 40 · 700 = 48 · 800 = 64 (SDD `layout.json`). Example from spacing.md: side-nav items sit spacing-75 (4px) apart, and sections are separated by spacing-400 (24px).
- **Component heights (desktop):** 50 = 20 · 75 = 24 (S) · 100 = 32 (M, the default) · 200 = 40 (L) · 300 = 48 (XL) (SDD `layout.json`).
- **Insets (desktop, M size):** edge-to-text 12px, edge-to-visual 10px, icon-only button padding 6px, text-to-icon gap 6px. S size: 9 / 7 / 4 / 5px (SDD `layout.json` `component-edge-to-*`, `text-to-visual-*`).
- **Corner radii:** small-default 4px, medium-default 8px, large-default 10px, extra-large 16px. Sized action buttons use 6/7/8/9/10px for XS/S/M/L/XL (SDD `layout.json`; SCSS actionbutton `spectrum-two.css`). S1 legacy action buttons used 4px.
- **Density** is "the spacing between components … regardless of their size" (spacing.md). Standard panels come in **compact / regular / spacious**: "Use compact for complex professional tools where maximizing screen space is essential". Regular is the default for creative tools. "Use a single panel density across a product" (SDD `docs/s2-docs/components/containers/standard-panel.md`). Action groups also have regular/compact density: compact keeps font and icon size but tightens spacing (action-group.md).

---

## 4. Panels / inspector, tabs, tree (layers)

**Standard panel** (SDD `standard-panel.json` and `standard-panel.md`):
- Width: default 260px, min 200px, max 400px. Widths come in small, medium (default) and large. "Medium … works well for tools that interact with a canvas area, including filters, sliders, text boxes, or swatches."
- Placement is anchored (docked), floating or dragged. "Anchored panels are docked in fixed areas of the workspace … without obstructing the canvas."
- Content can be split into sections with an embedded **accordion**, which allows one or many sections open. The title is optional and comes in small or medium. The close button and the drag gripper are both optional. Gripper colour is gray-500, or gray-800 while dragging.
- Scroll: "Panels always scroll independently from the canvas … The header and footer areas of a panel can remain fixed."

**Tabs** (SDD `tabs.json`, SCSS `components/tabs/index.css`, SDD `tabs.md`):
- Unselected text is gray-700 `#AFAFAF`; selected text is gray-800 `#DBDBDB`. The selection indicator is a **2px bar** (`tab-selection-indicator-thickness`) in gray-800. The "emphasized" variant colours the selected text and bar blue-900. The divider line under the tabs is gray-200.
- Compact tab height on desktop is 32px for M (24px for S). Regular height is 48px for M. Gap between tab items is 24px for M.
- "If one tab item has an icon, then they all should have an icon." "An icon-only tab should always show a tooltip displaying the label on hover." When tabs don't fit, use a quiet picker or scroll. "Do not truncate multiple tab items."

**Tree view, as the layers list** (SDD `tree-view.json`, `tree-view.md`):
- Each nesting level indents **16px** (`tree-view-level-increment`). Row minimum height is 40px. Rows overlap by 1px (`item-to-item -1px`). Minimum width is 160px.
- Hover is gray-100 `#2C2C2C`. Selection styles are covered in §1.5.
- Selection style can be "highlight" or "checkbox". "Highlight [when] checkboxes add clutter … clicking a new item replaces the previous selection".
- A drag handle appears "only on hover, active and keyboard focus". Parent items must use a chevron to expand and collapse. Labels that are too long get an ellipsis, plus a tooltip with the full label.
- "Choose icons that match the object type represented in the tree view."
- "Any action for modifying the hierarchy should be offered as an explicit control and, if needed, as a keyboard shortcut — but never as a shortcut alone."

**App frame** (SDD `docs/s2-docs/designing/app-frame-overview.md`): the app is divided into a header, side navigation and content area, plus "zones". One zone holds global view actions (layout, zoom) "in the header, or in a dedicated side rail". Another is "reserved for transient actions that are contextual to content". Gradients are never used in the header or navigation.

---

## 5. Tool rail, icons, labels and tooltips

- **Tool rail pattern = vertical action group.** Action groups are horizontal by default; "vertical … should be reserved for when horizontal space is limited". "Use the fully justified variant when using the vertical compact action group." Compact non-quiet groups connect their buttons (SDD `action-group.md`).
- **Emphasis:** blue selected state for tool selection "within a tool bar". Panels stay monochrome (§1.5).
- **Quiet vs. not quiet:** quiet buttons show no background "until they're interacted with". Use them when "a clear layout (vertical stack…) makes it easy to parse", but "too many quiet components in a small space can be hard to read" (action-button.md).
- **Action button colours (dark):** default fill gray-100 `#2C2C2C`. Hover and down gray-200 `#323232`. Quiet buttons have a transparent fill that turns gray-200 on hover. Selected (non-emphasized) is gray-800 fill with gray-50 content. No border (SCSS `components/actionbutton/themes/spectrum-two.css`).
- **Icons:** the desktop workflow icon sits on a **20px canvas** (about 18px glyph). The **16px** canvas (about 14px glyph) is for "UI areas — like a layers panel, lists, or cards". Stroke weight is **1.5px**, with rounded corners and rounded end caps. Mobile uses 24px and 20px canvases (SDD `docs/s2-docs/designing/using-icons.md`). Tokens: workflow-icon-size-50/75/100/200 = 14/16/20/22px on desktop (SDD `layout.json`). Spectrum says not to use icons from outside its library in Adobe work. Skeleton is not Adobe, so it needs its own open icon set drawn in the same style (outline, 1.5px stroke, rounded caps, 20px and 16px canvases).
- **Labels vs icon-only:** "Action buttons should always have a label, unless they are only using an icon that is universally understood." "If the label is hidden, an icon is required, and the label will appear in a tooltip on hover." Use an icon "only when necessary and when it has a strong association with the label text" (action-button.md). Truncated text shows its full version in a tooltip.
- **Tooltips** (SDD `docs/s2-docs/components/feedback/tooltip.md`, SCSS tooltip CSS, SDD `tooltip.json`):
  - "When you use components that don't have labels — for example, icon-only action buttons and tabs — make sure to use tooltips."
  - Show on hover **or keyboard focus**. "They should not contain actions or links."
  - Keep them to "1 or 2 short sentences". A name-only tooltip has no full stop.
  - The neutral variant fill is neutral-subdued-background → gray-500 `#6D6D6D` (dark), with white text. Informative and negative variants use blue/red plus a required icon.
  - Size: 24px minimum height, 12px text, 9px side padding, 160px maximum width, a 10×5px tip, wraps if long.
  - **Timing:** a global warm-up delay, then instant tooltips across elements until a cooldown passes. Help icons show their tooltip immediately. React Spectrum uses **1500ms warm-up and 500ms cooldown** (RS `packages/react-stately/src/tooltip/useTooltipTriggerState.ts`, `TOOLTIP_DELAY` / `TOOLTIP_COOLDOWN`).

---

## 6. Focus and state progression

- States progress default → hover → down → keyboard focus, and "a change in color is the primary way that a state is communicated". Some S2 components shrink slightly when pressed (states.md).
- Keyboard focus adds a **2px blue-800 ring, offset 2px** to the hover look (SDD `layout.json` focus-indicator tokens; action-button.md). Under `forced-colors`, React Spectrum maps the focus ring to the system `Highlight` colour (RS `spectrum-theme.ts` `outlineColor['focus-ring']`).
- Disabled controls keep their layout. Content turns gray-400. Disabled borders are gray-300.
- Contrast policy: "Spectrum designs all active states of UI components to be at least 3:1 in contrast … all objects within components, such as icons, drag handles, and text, are also compliant with the 3:1 or 4.5:1 requirement" (grays.md).

---

## 7. Wording guidance that suits the plain-language goal

Source: SDD `app-frame-overview.md`, "Terminology and content standards".
- Internal anatomy terms "are not representative of how these parts of the app frame should be described to end users."
- "Describe parts of the UI in terms of function (what something does…) rather than appearance or position (such as … left, right, top, bottom)."
- "The word **panel** is acceptable as a user-facing term only when there is no other way to describe the interface." "The word **rail** … should never be used as a user-facing term." For example, write "Show more options" instead of "Hide navigation rail".
- "'Show' and 'hide' are the preferred terms to use to describe the open/close actions on the side navigation."

---

## 8. Suggested starter palette for Skeleton's chrome (derived, not copied)

This is a mapping of the S2 dark tokens above onto Skeleton's areas, for the visual-style ticket to confirm by mock:

| Skeleton area | Value |
|---|---|
| Preview surround (pasteboard) | `#111111` |
| Panels, tool rail, status bar, title bar | `#1B1B1B` (layer 1). Optionally `#222222` (layer 2) for the inspector body |
| Floating menus / popovers | `#222222` + `#444444` 1px border + the three-layer shadow |
| Panel separators | 1px `#111111` (darkest, as S1 app frames did) or spacing alone |
| Row/button hover | `#2C2C2C`; pressed `#323232` |
| Inputs | fill `#111111`, border `#6D6D6D` → hover `#8A8A8A` → focus `#DBDBDB` |
| Text: primary / secondary / caption / disabled | `#DBDBDB` / `#AFAFAF` / `#8A8A8A` / `#444444` (headings `#F2F2F2`) |
| Accent (active tool, focus ring, selection outline) | `#4069FD` (hover `#345BF8`); accent text `#5681FF`; selected layer row `rgba(64,105,253,.10)` → `.15` hover |
| Errors / warnings / OK | `#FC432E` / `#E06400` / `#099D59` |
| Font | `ui-sans-serif, system-ui, sans-serif` at 14px/18px for controls, 12px/16px for small labels and tooltips, 11px for status bar details. Panel titles 14px bold |
| Sizes | control height 32px (24px compact); icons 20px in the tool rail, 16px in lists; radius 4px for inputs, 8px for buttons; 16px tree indent; 2px focus ring with a 2px gap |

## Gaps

- The live spectrum.adobe.com pages and Adobe's UXP (Photoshop plugin) docs could not be fetched because the proxy blocks them. Their content is covered here by the S2 doc export in the SDD repo. UXP-specific host-theme variables were not checked.
- The S2 exports say "detailed values are still in progress" for drop shadows (object-styles.md). The shadow tokens above are the current shipped values.
