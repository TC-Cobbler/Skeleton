# Name every theme value, setting and agent control

Type: grilling
Status: resolved
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

The vocabulary ticket settled that three things get curated plain names, not raw code names. It didn't choose the individual entries. What is each entry called on screen?

1. **Theme value names** for the scaffolded theme, about 30 values (e.g. `--primary` → "Main colour", `--radius-card` → "Card corners"), plus the fallback rule for values a user or agent adds.
2. **Setting labels and option values** for the 19 component settings and their values (e.g. `variant` → "Style", `destructive` → "Danger", `asChild` hidden).
3. **Agent-controls names** for the props agent code usually sets (e.g. `onClick` → "What happens on click", `value` → "Current value"), plus the fallback.

The agent proposes full tables from `packages/templates` and the scaffolded `globals.css`, and Johnny edits and approves them. The approved tables go into the spec. Terms already in `GLOSSARY.md` are the starting point.

## Answer

Settled with Johnny in one grilling round; every proposed table was approved as written. The spec copies these tables into the renderer's copy file (see [Decide how tests keep up with renamed text](07-tests-and-renames.md)).

### 1. Theme value names

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

### 2. Setting labels and options

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

### 3. Agent controls names (read-only)

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

### 4. Element part names (Layers, element names)

This gap surfaced during the session and was added to the ticket with Johnny's approval.

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
