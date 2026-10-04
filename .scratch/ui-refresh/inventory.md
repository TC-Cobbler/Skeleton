# UI inventory: every user-visible string and control

Resolves ticket [01 Inventory every user-visible string and control](issues/01-inventory-ui-surface.md). Snapshot of `main` @ `f7504d0` (after the v1.0.x dogfood fixes).

**Sources:**
- `packages/app-renderer/src` (16 components) and the overlay chrome (`packages/overlay/src/overlay.ts`, `gizmos.ts`): extracted mechanically from JSX text and visible attributes, then reviewed by hand.
- The palette catalogue and property labels in `packages/templates/src/palette.ts`.
- Messages main sends to the renderer, which show up as toasts and inline errors.

**Column key:**
- **Flag**:
  - `dev`: developer or Skeleton-internal term
  - `css`: CSS/Tailwind term
  - `file`: a file name or path
  - `code`: raw code or identifier shown as text
  - `ok`: fine as is
  - `tone`: plain words but needs a gentler rewrite
- **Test**: the e2e/unit test files that *find UI by this text* (`getByRole` name, `getByLabel`, `getByText`, or a text or title assertion). Most tests address UI by `data-testid`, which a rename doesn't touch.
  - `—`: no test queries it.
  - Blank in a group row: see the individual rows.

## Summary

| | |
|---|---|
| Distinct visible strings (renderer + overlay) | ~260 after removing internal identifiers (441 raw extractions) |
| Palette and property labels (templates) | 23 components, 5 groups, 9 property groups, ~25 option labels, 23 descriptions |
| Prop names shown raw from component schemas | 19 (`variant`, `size`, `asChild`, `defaultValue`, `isActive`, …) |
| Main/core messages that can reach a toast | ~80 (37 edit-op refusals, 23 page/router, 6 token, 9 loop, 9 dev server, 6 scaffold); almost all `dev`/`code` |
| Strings flagged `dev`/`css`/`file`/`code` | ~110 of ~260 |
| UI texts that tests query by | 140 distinct, across 12 e2e files and 2 renderer test files (see "Test impact") |

**Everyday vs plumbing** (proposed for the layout ticket):

| Everyday (Johnny uses these constantly) | Occasional | Plumbing (hide behind "Advanced" or a status bar) |
|---|---|---|
| Canvas + preview width + light/dark preview | Pages | Dev server panel + its log |
| Layers | Notes | View source |
| Palette | Tokens | Version line (`v0.0.0 · Electron … · Node …`) |
| Selection + Properties | Violations | Pass: Files changed, Diff, Repaired, contract breaches, "Files that don't parse" |
| Hand off / Take back + history (Undo/Redo) | Pass (tasks done, agent replies) | Project path next to the title |
| Toasts | Colour panel (opened from a canvas chip) | Selection's Kind / ID rows |

## Concept hot list (input to the vocabulary ticket)

Each concept is shown in at least one place in this inventory.

| Concept | Where it shows today | Count | Note |
|---|---|---|---|
| **token** | Tokens tab, Colour panel "Token (light)", Violations "Promote to token", "Token name", gizmo labels `--radius (…)`, `--spacing`, `--type-base`, `--border-width`, token rows `--primary` | ~25 | Also shows CSS variable names (`--primary-foreground`) as the row labels |
| **violation / override** | Violations tab + count, "No overrides: everything is styled with tokens.", Colour panel tooltip "…: a violation", "…an override the violations panel lists", Pass "New violations" | ~10 | "Violation" sounds like the user did wrong |
| **locked / locked block / agent code** | 🔒 labels on canvas, Layers 🔒 rows, Selection "Locked" row, Pass "New locked blocks", refusals "It's inside 🔒 {…}", Properties "set by agent code", lock reasons (`.map() loop`, `custom component`, `MemberExpression expression`, `spread props`, `member or namespaced element`, `fragment`, `conditional`) | ~25 | Lock *reasons* are raw AST terms |
| **data-ui-id / ID** | "has no data-ui-id" ×6, Selection "ID" row, `#ui_xxxxx` in every canvas label, layer row, note and pass line | ~15 + every label | Rule: the file name/attribute keeps its name; the UI should stop surfacing it |
| **pass / handoff #n** | "Pass #3", "Revert pass #3…", "Handoff #4: 2 open notes go to the agent…", "With agent · handoff #2", "Agent, pass 1:", "(pass 2)" | ~12 | "Hand off" / "Take back" stay; "pass" and "#n" are the question |
| **orphaned** | "Orphaned (n)", "n notes are orphaned: see the tray in Notes." | 2 | |
| **contract breach / repaired / re-minted** | Pass summary | 4 | |
| **diff / files changed / modified / added** | Pass summary, "Diff against the handoff" | 5 | |
| **dev server / Vite / port / log** | Dev server panel, canvas messages "Starting the dev server…" ×5 | ~9 | |
| **component / palette / primitive / plain** | Selection "Kind" row values, Palette heading, "{group} components" | ~6 | The Kind values are raw classifier names |
| **CSS words in properties** | `className`, `direction`, `Gap`, `Padding X/Y`, `Justify`, `Align`, `Wrap`, `Columns`, `px` | ~12 | Plus raw prop names: `variant`, `size`, `asChild`, `defaultValue`, `isActive`, `showCloseButton`, `orientation`, `collapsible`… |
| **gizmo scopes** | "Drag: …", "Shift: …", "Alt: …", "this element only", "type scale step", "spacing scale" | ~10 | Modifier keys shown as scope names |
| **Detach / Attach / Derived / formula** | Tokens rows | 5 | |
| **Snap / Promote / Keep / acknowledge** | Violations rows | 5 | Tooltip names `skeleton/config.json` |
| **Select mode / Interact mode** | Canvas header | 2 | The button shows the *current* mode, but reads like an action |
| **Stack / Grid / Container / Spacer** | Palette, layer names, drop labels "into Stack #…" | — | Layout primitive names; arguably fine, but "Stack (vertical)" vs "Column" is a choice |

## Inventory by area

Line numbers are in `packages/app-renderer/src/<file>`, or `packages/overlay/src/<file>` for the overlay.

### 1. Project picker (`ProjectPicker.tsx`): everyday, first run

| String / control | Where | What it does | Flag | Test |
|---|---|---|---|---|
| "Open" (heading) | picker | heads the open-a-project section | ok | — |
| "Open…" | button | opens a folder chooser to open an existing project | ok | canvas, devserver, gate2, smoke |
| "Open a Skeleton project" | OS dialog title | — | ok | — |
| "No recent projects." | empty state | — | ok | — |
| "Recent projects" (aria) | list | list of projects opened before | ok | devserver |
| "(missing)" | recent row | that project's folder no longer exists | tone | — |
| "Forget" / "Forget {name}" | recent row button | removes it from the list (files untouched) | ok | — |
| "New project" (heading) | picker | — | ok | devserver |
| "Project name" (aria) | input | names the new project | ok | 8 e2e files |
| "in {folder}" + "Change…" | under name | shows and changes where it's created | ok | 8 e2e files |
| "Where should the project go?" | OS dialog title | — | ok | — |
| "Create project" / "Creating…" | button | scaffolds the project | ok | 8 e2e files |
| "Writing files, installing dependencies, making the first commit…" | progress line | what creation is doing | dev ("dependencies", "commit") | — |
| "{folder} isn't a Skeleton project…" (from main) | toast | opened folder lacks Skeleton's files | ok | devserver (regex) |

### 2. App header (`App.tsx`): plumbing, apart from the title

| String / control | What it does | Flag | Test |
|---|---|---|---|
| Project name (h1, from `skeleton/config.json` `name`, e.g. "Game Library") | title | ok | devserver |
| Project path (code) | where the project lives | file | — |
| "Close project" | back to the picker | ok | devserver |
| "v0.0.0 · Electron 44.5.0 · Node 24.21.0 · linux" | version info | dev | smoke (regex `/Electron \d+/`) |

### 3. Canvas toolbar (`App.tsx` sidebar top): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Canvas" (label) | heads the controls | ok | — |
| "Select mode" / "Interact mode" (toggle; label = current mode) | select elements vs use the app as a visitor would | dev-ish, ambiguous (state shown as action) | canvas, devserver |
| History (aria): "Undo" / "Redo" | step through this session's edits | ok | compose, dogfood-fixes, gate4, gate5, tokens |
| Undo title "Undo {edit} (Ctrl+Z)" / "Nothing to undo"; Redo "Redo {edit} (Ctrl+Shift+Z)" / "Nothing to redo" | names the edit, e.g. "Undo Insert Badge" | ok (edit names below) | compose ("Undo Insert Badge (Ctrl+Z)") |
| Edit names from main: "Insert {Palette}", "Set {prop} on {Name}", "Edit text of {Name}", "Change layout of {Name}", "Move {Name}", "Delete {Name}", "Promote {value} to a token", "Set {n} tokens", "Add/Rename/Delete page {path}" | appear in the Undo/Redo titles | `code` when `{prop}` is a raw prop name | compose |
| Preview width (aria): "Desktop", "Tablet", "Mobile", "Side by side" | frame width | ok | canvas |
| Colour mode (aria): "Light" / "Dark" | the *preview's* theme | ok; ambiguous once Skeleton's own chrome is dark | canvas, gate4, tokens |

### 4. Hand off panel (`LoopPanel.tsx` top): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "With you" / "With agent · handoff #{n}" | whose turn it is | dev ("handoff #n") | gate5 |
| "Hand off" | validate, write `HANDOFF.md`, commit, lock | ok (stays) | gate5 |
| "Handoff #{n}: {k} open note(s) go(es) to the agent as tasks in HANDOFF.md." | what Hand off will send | file, dev | — |
| "Take back" | commit the agent's work, review it, unlock | ok (stays) | gate5 |
| "Run your agent on the project (its tasks are in HANDOFF.md), then take it back here." | instructions while with the agent | file | — |
| Busy: "Handing off… (checking the build)", "Taking back… (analysing and building)", "Reverting the pass…" | progress | dev ("build", "pass") | — |
| Refusals from main: "The project is already with the agent (handoff #n).", "Duplicate IDs: {where}. Each element needs its own data-ui-id before handing off.", "The project doesn't build, so it can't be handed off:\n{compiler output}", "The project isn't with the agent: there's nothing to take back.", "A source file doesn't parse: {error}", "{target} isn't on any element in the project", "{notes.json} can't be read: …" | toast / inline error | dev, code, file | — |

### 5. Canvas (`Canvas.tsx`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| Frame caption "{width} · {w}px · {zoom}%" (+ "· updating…") | which preview and its zoom | css ("px") | — |
| Frame title "Preview ({width})" | iframe name | ok | — |
| "Starting the dev server…", "Installing dependencies…", "The dev server isn't running.", "The dev server stopped unexpectedly. See the log below.", "The dev server couldn't start. See the log below." | canvas placeholder states | dev | — |
| Veil: "With agent · handoff #{n}" + "The canvas is locked while your agent works. Press Take back when it's done." | canvas locked while away | dev ("handoff #n"); "locked" collides with locked blocks | gate5 |
| "No page file for {path}" | route without a file | file | — |

### 6. Canvas overlay chrome (`overlay.ts`, `gizmos.ts`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| Selection/hover label "{Name} #{ui_id}" (e.g. "Button #ui_exp0r"); the selected one is a grip with title "Drag to move" | names the element; drag to move | dev (`#ui_…`) | canvas, tokens (regex) |
| Locked label "🔒 {Name or kind} #{id}", kinds ".map()", "conditional", "{…}", "<>…</>", "{...}" | agent code that can't be rewritten | code | compose ("🔒 map (.map() loop)"), canvas ("custom component") |
| Drop labels "into {Name #id}", "before/after {Name #id} in {Name #id}" | where a drop will land | dev (`#id`) | — |
| Gizmo hover "{Drag/Shift/Alt}: {what}", what = "this element only", "--radius (every radius derived from it)", "--radius-{x} (every {x})", "--spacing (the whole spacing scale)", "{prop}: spacing scale", "--type-base (the whole type scale)", "type scale step", "--border-width (every default border)" | what a handle drag changes, per modifier | dev, css (token names) | tokens (regex) |
| Gizmo live "{text} · {n} elements" / "· this element", text = "--radius: 0.75rem", "rounded-[12px]" etc. | value while dragging | css, code | gate4/tokens (via test ids) |
| Gizmo refusal "Can't: {reason}", reasons "--radius isn't a length", "it has no radius token (rounded-button, rounded-card…)", "its {prop} isn't a step of the spacing scale", "its border width isn't the token (plain `border`)" | why a handle won't drag | css, code | — |
| Colour chip title "{utility}: {token}" (e.g. "bg-primary: --primary") | click to open the Colour panel | css | — |
| Note pin text "{n}" / "✓", "↩" when replied; title "{k} open of {n} notes · agent replied" | notes on this element | ok | mapping |
| Text editor aria "Text of {Name}" (double-click text) | edit text in place | ok | — |

### 7. Pages (`PagesPanel.tsx`): occasional

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Pages" / "Pages list" | the app's pages | ok | compose, canvas, devserver |
| Row "{path} {Component}" (e.g. "/stats StatsPage") | a page; click to show it | code (component name) | compose |
| Row disabled title "{file} is missing" / "Not a page file Skeleton can read" | page unavailable | file | — |
| "Add page" / "Rename" / "Delete" | page ops | ok | compose |
| Form "Add page" / "Rename page" with "Name", "Path", "Add"/"Rename", "Cancel" | — | dev ("Path") | compose |
| Confirm "Delete {Component} and {path}?" + "Delete page" / "Cancel" | — | code | compose |
| Errors from main (router ops), e.g. `"/Foo" isn't a page path: use lowercase words and dashes, like /orders or /orders/archive`, "no createBrowserRouter([...]) call with an inline route array", "router doesn't parse: …" | toast | ok (first); code (others) | — |

### 8. Palette (`PalettePanel.tsx` + `templates/palette.ts`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Palette" heading | — | dev-ish (design-tool word; fine?) | compose, canvas-click |
| Groups "Layout", "Inputs", "Display", "Overlay", "Navigation" (aria "{group} components") | — | ok ("components" dev) | compose |
| 23 entries: Stack (vertical), Stack (horizontal), Grid, Container, Spacer, Button, Input, Textarea, Select, Checkbox, Switch, Form, Card, Badge, Avatar, Table, Tabs, Separator, Dialog, Sheet, Dropdown Menu, Toast, Sidebar | drag onto the canvas | mostly ok; "Stack", "Container", "Spacer", "Sheet", "Toast" are dev-ish | compose, gate3 (by test id) |
| Descriptions (tooltips): e.g. "Auto-layout column. Children stack top to bottom.", "Centred, width-capped section holding a stack.", "Brief notification, fired from code.", "Labelled fields and a submit button. The agent wires up validation and submit." | explain each entry | dev in places ("Auto-layout", "fired from code") | — |
| Disabled title "This project doesn't have {X}." / "Toaster is already mounted…" | why an entry is off | dev ("mounted") | compose (regex) |

### 9. Layers (`LayersPanel.tsx`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Layers" / "Layers tree" | the page's element tree | ok | dogfood-fixes, devserver |
| Row "{Name} {ui_id}" | an element; click to select | dev (ID on every row) | (by test id) |
| Row "🔒 {map / conditional / expression / custom component name}" | agent code | code | — |
| Title "Not rendered on the canvas right now" | element is hidden (e.g. closed dialog) | ok | — |
| "Expand" / "Collapse" (aria), ▸ ▾ | — | ok | — |

### 10. Selection (`SelectionPanel.tsx`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Selection"; empty "Click to select." / "Nothing selected." | — | ok | smoke |
| Rows "Element {Name}", "Kind {palette / primitive / plain / locked}", "ID {ui_id / none}", "Locked {reason}", "Agent logic {onClick, value…}" | facts about the element | dev, code (Kind values and reasons are classifier/AST terms; prop names) | (by test id) |
| "Move up (Alt+↑)" / "Move down (Alt+↓)"; disabled reasons "It's already first.", "It's already last.", "It's inside 🔒 {…}: edit it in place.", "{Name} has no data-ui-id.", "The page's root element can't be moved." | reorder within the parent | tone/dev for the reasons | dogfood-fixes ("It's already last.") |
| "Delete (Del)" and reasons "It's no longer on the page.", "The page's root element can't be removed.", "It's inside 🔒 {…}, agent code that uses it: edit it in place, or delete the whole block.", "Neither it nor its parent has a data-ui-id." | delete | dev (`data-ui-id`) | nodes.test |
| "Open {Dialog/Sheet} in canvas" / "Close {Dialog}"; titles "Opens it the way the app does, by its trigger; the code doesn't change.", "Its trigger isn't on the canvas: the app opens this {kind} some other way." | show an overlay's content for editing | ok / dev ("trigger") | dogfood-fixes |
| Confirm "This deletes agent code too:" + list + "Delete anyway" / "Cancel" | delete with agent code | ok (plain) | compose |

### 11. Properties (`PropertiesPanel.tsx`): everyday

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Properties"; "This element has no data-ui-id, so Skeleton can't edit it."; "No properties to edit here." | — | dev (first) | — |
| Prop rows labelled by **raw prop name**: `variant`, `size`, `disabled`, `type`, `placeholder`, `value`, `orientation`, `side`, `align`, `defaultValue`, `defaultOpen`, `defaultChecked`, `asChild`, `collapsible`, `isActive`, `showCloseButton`, `position`, `rows`, `direction` | edit a component option | code (camelCase prop names) | compose (`variant`, `size`, `disabled`, `direction`) |
| Prop option values shown raw: `default`, `secondary`, `outline`, `destructive`, `ghost`, `link`, `sm`, `lg`, `icon`, `horizontal`, `vertical`, … ; "(custom)" | — | code | compose ("(custom)") |
| "set by agent code" (title "Set by agent code; edit it in code") | protected prop, read-only | ok-ish ("edit it in code" assumes code) | compose (`onClick`) |
| "Text" (input) | element text | ok | compose |
| Group heading "Stack" / "Grid"; rows "Align", "Justify", "Gap", "Padding", "Padding X", "Padding Y", "Wrap", "Columns"; options "Start, Center, End, Stretch, Baseline, Space between/around/evenly, No wrap", gap/padding steps as numbers "0…12", "—" | layout options | css (Justify, Align, Padding X/Y, Gap, Wrap) | compose (Gap, Justify, Align, Padding X) |
| "Its classes are set by agent code, so layout is edited in code." | layout locked by agent | dev ("classes") | — |
| Toasts from `classEditsBlocked`: "it's a locked block: its classes are agent code", "its className is set by agent code"; "Can't change this element: {reason}" | refusals | code (`className`) | — |

### 12. Inspector tabs (`App.tsx`): everyday shell

| String / control | What it does | Flag | Test |
|---|---|---|---|
| Inspector (aria) tabs "Element", "Tokens", "Violations ({n})", "Notes ({n})", "Pass" | switches the right column | dev (Tokens, Violations, Pass) | gate4, gate5, tokens, devserver |

### 13. Tokens (`TokensPanel.tsx`): occasional

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Tokens"; "Filter" (aria "Filter tokens"); file name line "src/styles/globals.css" | the design system's values | dev, file | gate5, tokens |
| Groups "Colour", "Radius", "Spacing", "Type", "Font", "Border width" + columns "Light" / "Dark" | — | ok ("Radius" css-ish) | tokens |
| Row label = CSS variable name (`--primary`, `--primary-foreground`, `--radius-card`, …); count badge title "Elements on this page it affects" | — | code | tokens ("--primary value", "--radius value") |
| Inputs aria "{token} value" / "{token} dark value" | edit the value | code | tokens, gate5 |
| Values shown raw: `oklch(0.205 0 0)`, `0.625rem`, `calc(var(--radius) - 4px)` | — | css | — |
| "= {formula}…" (title "Derived: follows the tokens it refers to") | value comes from other tokens | dev, css | tokens ("= 0.5rem") |
| "Detach" (title "Replace the formula with {value}" / "It doesn't come to a single value, so it can't be detached here"), "Detached", "Attach" (title "Back to {formula}") | freeze or restore a derived value | dev | tokens |
| Errors from core: `token "{x}" must start with --`, `invalid value for {x}: …`, `{x} is defined in several blocks …`, `{x} not found …` | toast | code | — |

### 14. Colour panel (`ColourPanel.tsx`, from a canvas colour chip): occasional

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Colour" / "Close colour"; Colour scope (aria) | — | ok | gate4, tokens |
| "Token (light)" / "Token (dark)" (title "Edit {token} ({mode})") | change the shared colour everywhere | dev | tokens |
| "This element" (title "An arbitrary colour on this element: a violation") | one-off colour | dev ("arbitrary", "violation") | tokens |
| "Pick colour" (colour input); "{token} {mode} value" | — | ok / code | tokens |
| "Writes {utility}-[#…] on this element: an override the violations panel lists." | consequence of a one-off | css, dev | — |

### 15. Violations (`ViolationsPanel.tsx`): occasional

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Violations"; empty "No overrides: everything is styled with tokens."; "Show kept ({n})" | one-off values not from the design system | dev | tokens |
| Row: "{Name}#{id}", "{file}:{line}", the offending class (e.g. `bg-[#ff0000]`, `style={…}`, `inline-style`), "nearest: {class} ({token} = {value})" | which element has a one-off value, and the closest token | code, css, file | tokens (regex) |
| "In agent code: fix it in code, or keep it." | agent-written one-off | ok-ish | tokens ("In agent code") |
| "Snap" (title "Replace with {class}") | use the nearest token | dev | tokens |
| "Promote" → form "Promote to token", "Token name" (placeholder "name"), "Create" | make a new token from the value | dev | tokens |
| "Keep" (title "Acknowledge it and leave it (skeleton/config.json)") | accept it; stop listing | file | tokens |

### 16. Notes (`NotesPanel.tsx`): occasional

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Notes"; "Select an element to pin a note to it."; "{Name} has no data-ui-id, so notes can't be pinned to it."; "With the agent: notes can be changed again after Take back." | — | dev (second) | gate5 |
| Filters: Note type "All / Build / Behaviour / Question"; Note status "All / Open / Resolved"; "On {Name #id} only" + "Show every element's notes" | — | ok ("#id" dev) | gate5 ("All", "resolved") |
| Add form "Add a note": "Note on {Name #id}", type select, text (placeholder "What should the agent do?" / "Ask the agent…"), "Add" | — | ok | gate5 |
| Note row: type, text, "sent in #{n}", "Agent, pass {n}: {reply}", "Resolve"/"Reopen", "Delete" | — | dev ("#n", "pass") | gate5 ("Agent, pass 1: …") |
| "No notes here."; "Other agent replies" + "(pass {n})" | — | dev | — |
| Orphan tray "Orphaned ({n})", "Their elements are gone. Attach each to another element, or discard it.", "was on {Name #id}", "Attach to selected" (title "Attach to {Name} #{id}" / "Select an element with a data-ui-id first"), "Discard" | notes whose element was deleted | dev ("Orphaned", data-ui-id) | — |

### 17. Pass (`LoopPanel.tsx` PassPanel): occasional (summary) / plumbing (detail)

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Pass", "Pass #{n}"; empty "The agent's pass shows here after Take back." / "No pass to review: take one back first." | review of the agent's last turn | dev | devserver, gate5 |
| "Taken back in an earlier session: the summary isn't kept, but the diff is." | — | dev | — |
| "Build passes ({s} s)" / "Build fails" | did the app still build | dev | gate5 (regex) |
| "Tasks: {k} of {n} done · {r} replies"; "; {m} ticked tasks matched no note" | — | ok / dev | gate5 ("Tasks: 1 of 1 done") |
| "Contract breaches ({n})", "Rule {n}: {detail}" | agent broke the project rules | dev | gate5 |
| "Repaired ({n})": "Re-minted duplicate {id} → {id}", "Gave an ID: {id}" | Skeleton fixed IDs | dev | gate5 |
| "Files changed ({n})": "{path} +{a} −{d}", "added"/"deleted"/"modified" | — | file | — |
| "Elements added ({n})", "Elements removed ({n})"; "{n} notes are orphaned: see the tray in Notes." | — | dev ("orphaned") | — |
| "New violations ({n})", "New locked blocks ({n})" ("🔒 {kind} ({reason}, {file}:{line})"), "Files that don't parse ({n})" | — | dev, code, file | — |
| "Diff against the handoff" + per-file diffs; "The agent changed nothing." | — | dev | — |
| "Revert pass #{n}…" → "Put the project back as it was at handoff #{n}? The agent's work and your edits since take-back are committed first, so they stay in git history." + "Revert" / "Cancel" | undo the agent's turn | dev ("committed", "git history") | — |

### 18. Dev server (`DevServerPanel.tsx`) and View source (`ViewSource.tsx`): plumbing

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Dev server", status chip "running"/"stopped"/…, URL `http://127.0.0.1:{port}/`, "Start" / "Stop", log (Vite output) | runs the app preview | dev | devserver ("running", "Start", "Stop") |
| "View source" / "Hide source", "Source" (aria), "{file} · read-only" | the page file's code | dev, file | canvas |
| Dev server errors from main: "Vite isn't installed in this project (no node_modules/vite)…", "overlay bundle missing at …", "dev server task failed: …" | toast / canvas | dev, file | — |

### 19. Toasts and edit errors (`Toasts.tsx`, from main): all areas

| String / control | What it does | Flag | Test |
|---|---|---|---|
| "Dismiss" (aria) | close a toast | ok | — |
| "Edits aren't being typechecked: {reason}" | warning once per project | dev | — |
| "The edit was undone because it broke the typecheck:\n{compiler errors}" | post-edit rollback | dev, code | compose ("can't undo…" regex is related) |
| Edit-op refusals from core (37 kinds), shown as "{op} {id}: {message}", e.g. "template uses Input but the file doesn't import or declare it", "inserted <X> has no literal data-ui-id", "member-expression elements are not supported in templates", "{prop} is protected" | why an edit was refused | code | — |
| "Can't move there: {Name} has no data-ui-id." / "Can't drop there: {Name} has no data-ui-id." | drop or move refused | dev | nodes.test |
| `can't undo "{edit}": {file} changed since` | undo refused after an outside change | file | compose (regex) |

## Test impact (input to the "Test impact of renames" fog)

- **140 distinct UI texts are used by tests to find or check things**, across 12 e2e files (`canvas`, `compose`, `devserver`, `dogfood-fixes`, `gate1`–`gate5`, `smoke`, `tokens`, `canvas-click.ts`) and the renderer/overlay unit tests (`nodes.test.ts` for the refusal reasons, `mapping.test.tsx` for pin titles).
- **The rest are queried by `data-testid`**, which a rename leaves alone.
- **Heaviest coupling:**
  - `compose.test.ts`: properties labels `variant` / `size` / `Gap` / `Justify` / `Align` / `Padding X`, Undo titles, page forms, delete confirmation.
  - `tokens.test.ts`: Tokens, Violations, Colour panel, Detach/Attach, Snap/Promote/Keep.
  - `gate5.test.ts`: Hand off, Take back, Notes form, pass summary lines "Contract breaches (0)", "Repaired (0)", "Tasks: 1 of 1 done".
  - `devserver.test.ts`: Dev server, Pass tab, Layers tree, picker labels.
- **Very widely used**: picker labels ("Project name", "Change…", "Create project", "Open…"), appearing in 4–8 files each. A shared helper would make their rename a one-line change.
- **Text-in-test, by design**: core and app-main unit tests assert on edit-op and loop error messages. Those messages are the main source of `code`-flagged toasts, so rewording them for the UI touches `ops.test.ts`, `routes.test.ts`, `loop.test.ts` and others. An alternative to rewording core's messages is to map known error kinds to plain text in the renderer; that's a spec decision.

## Notes for later tickets

- **Ambiguity once chrome is dark:** "Light / Dark" in the canvas toolbar and the Tokens columns mean the *project's* theme. With dark Skeleton chrome, they need a word that says "preview".
- **"Locked" means two things:** the canvas veil ("The canvas is locked while your agent works") and locked blocks. Vocabulary should split them.
- **IDs are everywhere** (canvas labels, layers, notes, pass, refusal reasons), although the map says to stop surfacing `data-ui-id`. Note pins and drop labels have names, so the IDs could go.
- **Message count:** about 80 messages from main/core can reach a toast, and a few dozen renderer empty states and confirmations exist. "Message tone" probably needs its own ticket rather than folding into vocabulary.
