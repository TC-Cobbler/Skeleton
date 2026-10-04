# UI refresh spec (v1.0.y)

This refresh changes how Skeleton's own UI looks and reads: the renderer, plus the overlay's chrome on the canvas. It is **on-screen presentation only**: no new features, no behaviour changes, no changes to what Skeleton writes into a user's project. It's for Johnny (PRD §4), who doesn't know HTML or CSS.

The decisions behind every section were made on the UI refresh map (`.scratch/ui-refresh/map.md`) and are recorded in its tickets. This spec is the build-ready summary; the tasks are in TASKS.md, **v1.0.y — UI refresh**.

**Unchanged:** files (`HANDOFF.md`, `skeleton/…`), git commit subjects, the project CLAUDE.md contract, `data-ui-id`, every edit op and its behaviour, the user's project styling, and the project preview's own light/dark switch. CLAUDE.md's non-negotiables all still hold.

**Not part of this refresh:**
- features that appear only in the Adobe reference
- a light theme for Skeleton's chrome
- a frameless window
- a log of past errors
- v1.1 work

---

## 1. Vocabulary

- **Glossary:** `GLOSSARY.md` (repo root) is the source for every on-screen term, and each term lists the words to avoid.
- **Element names:** elements are named by **element name** (kind plus distinguishing visible text, e.g. Button "Add game"), never by `data-ui-id`.
- **Code words:** IDs and code words appear only in Details, Copy details, the read-only page code view and the app preview log.
- **Name tables:** the tables in §6 give the plain name of every theme value, setting, agent control and element part.

## 2. Layout (layout D)

Approved mock: https://claude.ai/artifact/MhsieMN8riB41eGysyaSCC (source `.scratch/ui-refresh/prototypes/layout-prototype.html`).

- **Top bar:**
  - project name
  - page picker "Page: Library ▾", which replaces the Pages panel; add, rename and delete are in its menu
  - workspaces **Build | Style | Hand off**
  - Undo / Redo
  - **⋯ menu** with the Advanced items: App preview (start/stop and its log), Show code, About (including licence notices)
- **Left panel, by workspace:**
  - **Build:** Add / Layers tabs.
  - **Style:** Layers, plus the reach hint for handle drags.
  - **Hand off:** every note, plus Notes without an element.
- **Centre:**
  - **Canvas toolbar:** Edit | Try it, preview widths, App theme Light | Dark.
  - **Canvas**
  - **Hand-off bar** underneath: With you / Agent is working · round · open notes · Hand off / Take back · Review the agent's work.
- **Right: tabbed inspector**, the same in every workspace, with the tabs **Element / Theme / Off-theme / Agent's work**.
  - Each workspace opens its own tab: Build opens Element, Style opens Theme, Hand off opens Agent's work.
  - Selecting an element always shows Element.
  - The Element tab ends with that element's notes and the add-note form.
- **Status bar:** "Your app is running" (or its state) and what the current workspace is for. It shows only information that already exists.

## 3. Visual style (Compact pro)

Approved mock: https://claude.ai/artifact/CLNPoycX1SPcib24SX4dju (source `.scratch/ui-refresh/prototypes/style-prototype.html`, `.st-compact`). Dark only.

| Role | Value |
|---|---|
| Preview surround | `#111111` |
| Panels, bars, status bar | `#1B1B1B` |
| Toolbars, pop-overs, menus | `#222222` |
| Control fill / hover | `#2C2C2C` / `#393939` |
| Separators | 1px `#111111` |
| Text: headings / body / secondary | `#F2F2F2` / `#DBDBDB` / `#8A8A8A` |
| Inputs | fill `#111111`, border `#444444` |
| Accent (one blue) | `#4069FD` |
| Selected layer | blue at 16%, 2px blue left edge |
| Agent code | `#E8833A` |
| Notes | `#C084FC` |
| Tooltips | `#6D6D6D`, white text |

- **Type:** `ui-sans-serif, system-ui, sans-serif`. Body text is 12px, panel headings 10px uppercase and letter-spaced, tabs 11px.
- **Density:** bars 34px, controls about 24px tall, fields with a 3px radius, tight list rows.
- **Icons:** Lucide outline icons, 1.5px stroke, 20px (16px in lists).
  - **Icon-only:** the canvas toolbar and the top bar's Undo, Redo and ⋯.
  - **Words kept:** workspaces, Hand off / Take back, and anything to do with the agent or the project.
- **Tooltips:** every icon-only button shows its label on hover **and on keyboard focus**.
- **Blue is only used for:**
  - the selected layer
  - the canvas selection outline and handles
  - the active workspace
  - Hand off
  - the focus ring: 2px, with a 2px gap
- **Toggles and tabs:** a toggle that is on is grey (`#444` fill). The selected tab has a 2px blue underline.

## 4. Messages

### Where the wording comes from

- **Core and app-main keep their technical messages** and tests. Each error Johnny can meet also carries a stable **reason code** and the facts its sentence needs (element ID, page, web address, round).
- **The renderer's message table** turns code plus facts into a plain sentence. It names elements by element name.
- **The overlay** receives finished text from the host.
- **Three tiers:**
  - **Refusal:** has its own sentence.
  - **Problem:** has its own sentence plus an action: Undo, Restart or Copy details.
  - **Skeleton fault:** an internal check Johnny can't cause. It shares the catch-all: "Skeleton couldn't do that. Nothing in your project was changed." (or "…Something went wrong; see Details." when it isn't known whether anything changed).
- **Prevent before refuse:** where the UI already knows an action will be refused, the control is disabled and its tooltip shows **the same sentence** from the same table.
- **Details:**
  - Every message has a **Details** disclosure with the technical text and a **Copy details** button.
  - Opening Details stops the message auto-dismissing.
  - Copy details copies a block for the agent: what was tried, the page file, the element's `data-ui-id` and the technical message.

### Tone rules

1. Say what happened, then what to do (one or two short sentences).
2. Use glossary words only. No file names, IDs, `className`, "token", "pass", "build", "commit" or "dev server".
3. Say whether anything changed ("Nothing was changed.", "Skeleton undid it.").
4. No blame and no drama. No "Error:", "Invalid", "failed", "!" or "Oops". Use "Can't…" or "Skeleton couldn't…", never "You can't…".
5. Address Johnny as "you"; the AI is "the agent".
6. Sentence case with a full stop. Buttons are verbs ("Delete page"), never "OK" or "Yes".

**Other text:**
- Empty states say what goes here and how to fill it.
- Progress lines say what's happening in Johnny's terms.
- Confirmations name the thing and the consequence, with a verb button.

### Approved rewrites (the pattern for the full table)

| Family | Now | Plain |
|---|---|---|
| Edit refusal: agent code | `move(ui_ab12c): ui_ab12c is inside a locked block` | Can't change Button "Add game": it's inside agent code (a repeated list). You can move or delete the whole repeated list instead. |
| Edit refusal: agent control | `prop "onClick" carries agent logic and is protected` | Can't change what Button "Add game" does when clicked: the agent's code decides that. |
| Edit refusal: agent value | `its text includes an expression (agent logic)…` | Can't edit this text: the agent's code fills it in. |
| Drop / move | `Can't drop there: Card has no data-ui-id.` | Can't drop into Card yet: it was added outside Skeleton, and Skeleton will recognise it after the next Take back. |
| Undo | `can't undo "Set gap": src/pages/Library.tsx changed since` | Can't undo "Change space between items": the Library page has changed since then, probably by the agent. Undoing now would lose that change. |
| Undone edit | `The edit was undone because it broke the typecheck: …` | Skeleton undid that change because it would have broken your app. Nothing was changed. *(Details)* |
| Pages: input | `"/Foo" isn't a page path: use lowercase…` | A web address uses lowercase words and dashes, like /orders or /orders/archive. |
| Pages: refusal | `it's the only page` / `Stats.tsx is imported by …` | Can't delete the only page. Add another page first. / Can't delete the Stats page: other parts of your app use it. Ask the agent to remove those first. |
| Pages: problem | `router doesn't parse: …` | Skeleton can't read your app's list of pages, so pages can't be changed right now. *(Copy details)* |
| Theme | `--primary is defined in several blocks` | Can't change Main colour: the theme sets it in more than one place. *(Copy details)* |
| Hand off | `The project is already with the agent (handoff #3).` | The project is already with the agent (round 3). Take it back first. |
| Hand off: problem | `The project doesn't build, so it can't be handed off: …` | Can't hand off: your app has a problem in its code and won't start. *(Undo · Copy details)* |
| Take back | `The project isn't with the agent: nothing to take back.` | There's nothing to take back: the project isn't with the agent. |
| Take back: problem | `A source file doesn't parse: …` | Can't take back yet: the agent left the Library page in a state Skeleton can't read. Ask the agent to fix it, then try again. Nothing was changed. *(Copy details)* |
| App preview | `Vite isn't installed…` / `dev server task failed: …` | Your app can't start because some of what it needs isn't installed. *(Copy details)* / Your app stopped. *(Restart · Copy details)* |
| Project | `{folder} isn't a Skeleton project…` | {folder} wasn't made with Skeleton, so it can't be opened here. |
| Handles | `Can't: its padding isn't a step of the spacing scale` | Can't drag this: its inner space is a custom size, not a theme size. Pick a theme size first. |
| Skeleton fault | `insert(ui_ab12c): index 4 out of range (0..3)` | Skeleton couldn't do that. Nothing in your project was changed. *(Details)* |

| Empty state / progress / confirmation now | Plain |
|---|---|
| Nothing selected. | Click an element on the page to change it. |
| No notes here. | No notes yet. Select an element and add a note for the agent. |
| No pass to review: take one back first. | The agent's work shows here after you take the project back. |
| No overrides: everything is styled with tokens. | Everything follows the theme. |
| No properties to edit here. | This element has no settings. |
| No recent projects. | No projects yet. Create one to get started. |
| Starting the dev server… | Starting your app… |
| Writing files, installing dependencies, making the first commit… | Creating your project. This takes about half a minute. |
| Handing off… (checking the build) | Handing off: checking your app still works… |
| Taking back… (analysing and building) | Taking back: reviewing the agent's work… |
| Reverting the pass… | Undoing the agent's work… |
| Delete Stats and src/pages/Stats.tsx? · Delete page / Cancel | Delete the Stats page? Its web address /stats will stop working. · Delete page / Cancel |
| This deletes agent code too: … · Delete anyway | This also deletes agent code the app may rely on: … · Delete anyway / Cancel |

The build writes the full table: one sentence for every tier 1 and tier 2 reason code, following these rules and examples.

## 5. Build approach

- **Copy files:**
  - The renderer keeps all its on-screen words in one copy file, next to the message table.
  - The overlay has its own small copy file, so it never imports the host.
  - Panels and the test helpers read names from these files.
- **Styles:** plain CSS (no Tailwind or CSS-in-JS in Skeleton's UI).
  - A **shared style values file** of CSS custom properties holds §3's colours, sizes and type. It lives in a small folder that the renderer and overlay both read.
  - `styles.css` is split into area files (base controls, shell layout, panels, canvas chrome) that use only those properties.
  - The overlay injects the values file into its shadow root and drops its hard-coded hex colours.
- **Icons:** Lucide (ISC licence).
  - `lucide-react` in the renderer and `lucide` in the overlay, with only the icons used built in.
  - Licence notice in ⋯ → About.
- **Tooltips:** Skeleton's own Tooltip, plus an **IconButton** that requires a label. The label is the accessible name and the tooltip text.
  - Shows after about 0.5 s of hover, and at once on keyboard focus.
  - Hides on Escape or blur.
  - Native `title=` hints are removed.
- **Window:** the native frame, with `nativeTheme.themeSource = "dark"` and a `#111` window background.

## 6. Name tables

### 6.1 Theme value names

Values that only pass another value along (`--color-*`, `--default-border-width`) are hidden.

| Code | Plain name |
|---|---|
| background / foreground | Page background / Text |
| card / card-foreground | Card background / Text on cards |
| popover / popover-foreground | Menu background / Text in menus |
| primary / primary-foreground | Main colour / Text on main colour |
| secondary / secondary-foreground | Second colour / Text on second colour |
| muted / muted-foreground | Quiet background / Quiet text |
| accent / accent-foreground | Hover background / Text on hover |
| destructive | Danger colour |
| border / input / ring | Lines and borders / Text field borders / Focus outline |
| sidebar, -foreground, -primary, -primary-foreground, -accent, -accent-foreground, -border, -ring | Sidebar background, Text in sidebar, Sidebar main colour, Text on sidebar main colour, Sidebar hover background, Text on sidebar hover, Sidebar lines, Sidebar focus outline |
| radius | Corner radius |
| radius-xs / sm / md / lg / xl | Tiny / Small / Medium / Large / Extra-large corners |
| radius-button / input / card / dialog / popover / badge | Button / Text field / Card / Dialog / Menu / Badge corners |
| type-base / type-ratio | Text size / Text size step |
| text-xs / sm / base / lg | Smallest / Small / Body / Large text |
| text-xl / 2xl / 3xl / 4xl | Small heading / Heading / Large heading / Largest heading |
| border-width | Line thickness |
| spacing | Spacing unit |
| font-sans / font-mono | Text font / Code font |

**Fallback:** drop the `--`, any `color-`/`radius-`/`text-` prefix and the dashes, then use sentence case. A `radius-` value becomes "… corners" and a `text-` value becomes "… text". For example, `--brand-teal` → "Brand teal" and `--radius-chip` → "Chip corners".

### 6.2 Setting labels and options

| Setting (elements) | Label | Options |
|---|---|---|
| variant (Button, Badge) | Style | default Standard · destructive Danger · outline Outlined · secondary Subtle · ghost No background · link Link |
| variant (Tab bar) | Style | default Boxed · line Underlined |
| variant (Menu item / Sidebar button) | Style | Standard · Danger / Standard · Outlined |
| variant (Sidebar) | Style | sidebar Attached · floating Floating · inset Inset |
| size | Size | default Medium · xs Extra small · sm Small · lg Large · icon, icon-xs/-sm/-lg: Icon only (+ size) |
| type (Button) | In a form | submit Sends the form · reset Clears the form · button Does nothing by itself |
| type (Text field) | Kind of text | Text · Email address · Password · Number · Search · Phone number · Web link · Date |
| placeholder | Hint text | |
| rows | Height in lines | |
| disabled | Greyed out | |
| defaultChecked | Starts ticked (Checkbox) / Starts on (Switch) | |
| defaultValue | Starts with (Pick list) / Tab shown first (Tabs) | |
| value | Value (Option) / Tab link name (Tab, Tab content) | |
| position (Pick list's list) | List opens | item-aligned Over the field · popper Below the field |
| orientation | Direction | horizontal Across · vertical Down |
| direction (Column/Row) | Arrange | Down · Across |
| defaultOpen | Starts open | |
| showCloseButton | Close button | |
| side | Opens from (Side panel, Menu) / Side (Sidebar) | Top · Right · Bottom · Left |
| align (Menu) | Line up with button | Start · Centre · End |
| collapsible | When closed | offcanvas Slides away · icon Shrinks to icons · none Always open |
| isActive | Shown as current page | |
| asChild | hidden | |

**Layout class groups:**
- Padding / Padding X / Padding Y become "Inner space: all sides" / "Inner space: sides" / "Inner space: top and bottom".
- Line up's Baseline option becomes "Text baseline".
- Spread's extra options are "Space around" and "Space evenly".
- Columns stays "Columns".
- The empty choice "—" becomes "Not set".
- The other layout labels are as in GLOSSARY.md.

### 6.3 Agent controls names (read-only)

| Code | Plain |
|---|---|
| onClick | What happens on click |
| onChange, onValueChange | What happens when it changes |
| onCheckedChange | What happens when it's ticked |
| onSubmit | What happens when the form is sent |
| onOpenChange | What happens when it opens or closes |
| value / checked / open | Current value / Ticked or not / Open or not |
| href, to | Where it goes |
| disabled (agent-set) | When it's greyed out |
| className, style (agent-set) | Its look (decided by the agent's code) |
| src / alt | Image / Image description |
| children (agent value) | Its content |
| key, ref | hidden |

**Fallback:**
- Any other `on…` becomes "What happens on …" with the rest as words, e.g. `onMouseEnter` → "What happens on mouse enter".
- Anything else becomes its name as words, e.g. `maxLength` → "Max length".
- Raw code names are never shown.

### 6.4 Element part names (Layers, element names)


- **Default rule:** the parent's plain name plus the part in words, e.g. Card header, Card title, Table row, Sidebar menu.
- **Overrides:**
  - DialogContent → Dialog box
  - SheetContent → Side panel box
  - DialogTrigger / SheetTrigger / DropdownMenuTrigger → Opens dialog / Opens side panel / Opens menu
  - TabsList → Tab bar
  - TabsTrigger → Tab
  - TabsContent → Tab content
  - SelectTrigger → Pick list button
  - SelectItem → Option
  - AvatarFallback → Avatar initials
  - SidebarProvider → Sidebar area
  - SidebarInset → Main area beside sidebar
- **Select** is called **Pick list** on screen (added to GLOSSARY.md).

## 7. Tests

- **Finding things:** tests look things up by **role and visible name**, through one shared helper file. It holds named lookups and the layout's navigation (workspace, inspector tab, page picker, project picker). `data-testid` stays for things with no words: canvas frames, layer rows, handles.
- **Gate tests** (gate1–5, dogfood, dogfood-fixes) are updated in place. **Their steps and assertions stay the same**; only how they find things changes.
- **Core and app-main unit tests** keep their technical messages.
- **Renderer unit tests** refer to copy-file entries.
- **New checks:**
  - **Plain words:** a unit test reads both copy files and fails on any glossary *Avoid* word (whole word, not case-sensitive). Allowed exceptions: Details, Copy details, the page code view and the app preview log.
  - **Messages:** every reason code has a sentence.
  - **Buttons:** every icon-only button goes through IconButton.
  - **Tooltips:** behaviour tests for showing on hover and on focus.
- **No pixel snapshots.** Each slice is reviewed by people from screenshots.
