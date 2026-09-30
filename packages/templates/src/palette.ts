// The palette (T3.1, PRD §9.1): the curated components and layout primitives a user
// can place, each with a default JSX template, plus a typed prop schema for every
// element those templates use. Pure data about the vendored components in
// `project/src/components`; tests typecheck every template and every prop value
// against them in a real scaffolded project.

/** A literal prop the properties panel can set (T3.5). Only literal values: see ADR 002. */
export type PropSchema =
  | { name: string; type: "enum"; options: readonly string[]; default: string }
  | { name: string; type: "boolean"; default: boolean }
  | { name: string; type: "string"; default: string | null }
  | { name: string; type: "number"; default: number | null; min?: number; max?: number };

export interface ElementSchema {
  /** JSX name, e.g. "CardTitle". */
  name: string;
  /** Import source in the project, e.g. "@/components/ui/card". */
  from: string;
  props: readonly PropSchema[];
  /**
   * What goes between the tags: `nodes` accepts dropped elements (a drop target),
   * `text` has editable text content, `none` is self-closing.
   */
  children: "nodes" | "text" | "none";
  /** Layout properties the properties panel edits as classes (T3.5). */
  layout?: "stack" | "grid";
}

export type PaletteGroup = "layout" | "inputs" | "display" | "overlay" | "navigation";

export const PALETTE_GROUPS: readonly { id: PaletteGroup; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "inputs", label: "Inputs" },
  { id: "display", label: "Display" },
  { id: "overlay", label: "Overlay" },
  { id: "navigation", label: "Navigation" },
];

export interface PaletteItem {
  /** Stable key, e.g. "stack-horizontal". */
  id: string;
  label: string;
  group: PaletteGroup;
  description: string;
  /**
   * Default JSX: one element, Prettier-formatted, with no `data-ui-id`s (they're
   * minted when it's placed). Null for entries that can't be placed (see `note`).
   */
  template: string | null;
  /** Why the entry can't be placed, and what to do instead. */
  note?: string;
}

const UI = (file: string) => `@/components/ui/${file}`;
const LAYOUT = "@/components/layout";

const VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;

const el = (
  name: string,
  from: string,
  children: ElementSchema["children"],
  props: readonly PropSchema[] = [],
  layout?: ElementSchema["layout"],
): ElementSchema => (layout ? { name, from, props, children, layout } : { name, from, props, children });

const disabled: PropSchema = { name: "disabled", type: "boolean", default: false };
const asChild: PropSchema = { name: "asChild", type: "boolean", default: false };

const ELEMENT_LIST: readonly ElementSchema[] = [
  // Layout primitives
  el("Stack", LAYOUT, "nodes", [{ name: "direction", type: "enum", options: ["vertical", "horizontal"], default: "vertical" }], "stack"),
  el("Grid", LAYOUT, "nodes", [], "grid"),
  el("Container", LAYOUT, "nodes"),
  el("Spacer", LAYOUT, "none"),

  // Inputs
  el("Button", UI("button"), "text", [
    { name: "variant", type: "enum", options: VARIANTS, default: "default" },
    { name: "size", type: "enum", options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"], default: "default" },
    { name: "type", type: "enum", options: ["button", "submit", "reset"], default: "button" },
    disabled,
  ]),
  el("Input", UI("input"), "none", [
    { name: "type", type: "enum", options: ["text", "email", "password", "number", "search", "tel", "url", "date"], default: "text" },
    { name: "placeholder", type: "string", default: null },
    disabled,
  ]),
  el("Textarea", UI("textarea"), "none", [
    { name: "placeholder", type: "string", default: null },
    { name: "rows", type: "number", default: null, min: 1, max: 50 },
    disabled,
  ]),
  el("Label", UI("label"), "text"),
  el("Checkbox", UI("checkbox"), "none", [{ name: "defaultChecked", type: "boolean", default: false }, disabled]),
  el("Switch", UI("switch"), "none", [
    { name: "defaultChecked", type: "boolean", default: false },
    { name: "size", type: "enum", options: ["default", "sm"], default: "default" },
    disabled,
  ]),
  el("Select", UI("select"), "nodes", [{ name: "defaultValue", type: "string", default: null }, disabled]),
  el("SelectTrigger", UI("select"), "nodes", [{ name: "size", type: "enum", options: ["default", "sm"], default: "default" }]),
  el("SelectValue", UI("select"), "none", [{ name: "placeholder", type: "string", default: null }]),
  el("SelectContent", UI("select"), "nodes", [{ name: "position", type: "enum", options: ["item-aligned", "popper"], default: "item-aligned" }]),
  el("SelectItem", UI("select"), "text", [{ name: "value", type: "string", default: "option" }, disabled]),

  // Display
  el("Card", UI("card"), "nodes"),
  el("CardHeader", UI("card"), "nodes"),
  el("CardTitle", UI("card"), "text"),
  el("CardDescription", UI("card"), "text"),
  el("CardContent", UI("card"), "nodes"),
  el("Badge", UI("badge"), "text", [{ name: "variant", type: "enum", options: VARIANTS, default: "default" }]),
  el("Avatar", UI("avatar"), "nodes", [{ name: "size", type: "enum", options: ["default", "sm", "lg"], default: "default" }]),
  el("AvatarFallback", UI("avatar"), "text"),
  el("Table", UI("table"), "nodes"),
  el("TableHeader", UI("table"), "nodes"),
  el("TableBody", UI("table"), "nodes"),
  el("TableRow", UI("table"), "nodes"),
  el("TableHead", UI("table"), "text"),
  el("TableCell", UI("table"), "text"),
  el("Tabs", UI("tabs"), "nodes", [
    { name: "defaultValue", type: "string", default: null },
    { name: "orientation", type: "enum", options: ["horizontal", "vertical"], default: "horizontal" },
  ]),
  el("TabsList", UI("tabs"), "nodes", [{ name: "variant", type: "enum", options: ["default", "line"], default: "default" }]),
  el("TabsTrigger", UI("tabs"), "text", [{ name: "value", type: "string", default: "tab" }, disabled]),
  el("TabsContent", UI("tabs"), "nodes", [{ name: "value", type: "string", default: "tab" }]),
  el("Separator", UI("separator"), "none", [
    { name: "orientation", type: "enum", options: ["horizontal", "vertical"], default: "horizontal" },
  ]),

  // Overlay
  el("Dialog", UI("dialog"), "nodes", [{ name: "defaultOpen", type: "boolean", default: false }]),
  el("DialogTrigger", UI("dialog"), "nodes", [asChild]),
  el("DialogContent", UI("dialog"), "nodes", [{ name: "showCloseButton", type: "boolean", default: true }]),
  el("DialogHeader", UI("dialog"), "nodes"),
  el("DialogTitle", UI("dialog"), "text"),
  el("DialogDescription", UI("dialog"), "text"),
  el("DialogFooter", UI("dialog"), "nodes", [{ name: "showCloseButton", type: "boolean", default: false }]),
  el("DialogClose", UI("dialog"), "nodes", [asChild]),
  el("Sheet", UI("sheet"), "nodes", [{ name: "defaultOpen", type: "boolean", default: false }]),
  el("SheetTrigger", UI("sheet"), "nodes", [asChild]),
  el("SheetContent", UI("sheet"), "nodes", [
    { name: "side", type: "enum", options: ["top", "right", "bottom", "left"], default: "right" },
    { name: "showCloseButton", type: "boolean", default: true },
  ]),
  el("SheetHeader", UI("sheet"), "nodes"),
  el("SheetTitle", UI("sheet"), "text"),
  el("SheetDescription", UI("sheet"), "text"),
  el("DropdownMenu", UI("dropdown-menu"), "nodes"),
  el("DropdownMenuTrigger", UI("dropdown-menu"), "nodes", [asChild]),
  el("DropdownMenuContent", UI("dropdown-menu"), "nodes", [
    { name: "align", type: "enum", options: ["start", "center", "end"], default: "center" },
    { name: "side", type: "enum", options: ["top", "right", "bottom", "left"], default: "bottom" },
  ]),
  el("DropdownMenuLabel", UI("dropdown-menu"), "text"),
  el("DropdownMenuItem", UI("dropdown-menu"), "text", [
    { name: "variant", type: "enum", options: ["default", "destructive"], default: "default" },
    disabled,
  ]),
  el("DropdownMenuSeparator", UI("dropdown-menu"), "none"),

  // Navigation
  el("SidebarProvider", UI("sidebar"), "nodes", [{ name: "defaultOpen", type: "boolean", default: true }]),
  el("Sidebar", UI("sidebar"), "nodes", [
    { name: "side", type: "enum", options: ["left", "right"], default: "left" },
    { name: "variant", type: "enum", options: ["sidebar", "floating", "inset"], default: "sidebar" },
    { name: "collapsible", type: "enum", options: ["offcanvas", "icon", "none"], default: "offcanvas" },
  ]),
  el("SidebarContent", UI("sidebar"), "nodes"),
  el("SidebarGroup", UI("sidebar"), "nodes"),
  el("SidebarGroupLabel", UI("sidebar"), "text"),
  el("SidebarGroupContent", UI("sidebar"), "nodes"),
  el("SidebarMenu", UI("sidebar"), "nodes"),
  el("SidebarMenuItem", UI("sidebar"), "nodes"),
  el("SidebarMenuButton", UI("sidebar"), "text", [
    { name: "variant", type: "enum", options: ["default", "outline"], default: "default" },
    { name: "size", type: "enum", options: ["default", "sm", "lg"], default: "default" },
    { name: "isActive", type: "boolean", default: false },
  ]),
  el("SidebarInset", UI("sidebar"), "nodes"),
];

/** Schema per element name: exactly the components and primitives the templates use. */
export const ELEMENTS: Readonly<Record<string, ElementSchema>> = Object.fromEntries(ELEMENT_LIST.map((e) => [e.name, e]));

/** Plain HTML elements palette templates use. Editable, but they carry no prop schema. */
export const PLAIN_ELEMENTS: Readonly<Record<string, Pick<ElementSchema, "children">>> = {
  form: { children: "nodes" },
};

export const PALETTE: readonly PaletteItem[] = [
  // Layout
  {
    id: "stack-vertical",
    label: "Stack (vertical)",
    group: "layout",
    description: "Auto-layout column. Children stack top to bottom.",
    template: `<Stack className="gap-4 p-4" />`,
  },
  {
    id: "stack-horizontal",
    label: "Stack (horizontal)",
    group: "layout",
    description: "Auto-layout row. Children sit side by side.",
    template: `<Stack direction="horizontal" className="gap-4 p-4" />`,
  },
  {
    id: "grid",
    label: "Grid",
    group: "layout",
    description: "Columns of equal width.",
    template: `<Grid className="grid-cols-2 gap-4 p-4" />`,
  },
  {
    id: "container",
    label: "Container",
    group: "layout",
    description: "Centred, width-capped section holding a stack.",
    template: `<Container>
  <Stack className="gap-4 py-8" />
</Container>`,
  },
  {
    id: "spacer",
    label: "Spacer",
    group: "layout",
    description: "Takes up the free space in a stack, pushing siblings apart.",
    template: `<Spacer />`,
  },

  // Inputs
  { id: "button", label: "Button", group: "inputs", description: "Clickable action.", template: `<Button>Button</Button>` },
  { id: "input", label: "Input", group: "inputs", description: "Single-line text field.", template: `<Input placeholder="Type here" />` },
  {
    id: "textarea",
    label: "Textarea",
    group: "inputs",
    description: "Multi-line text field.",
    template: `<Textarea placeholder="Type here" />`,
  },
  {
    id: "select",
    label: "Select",
    group: "inputs",
    description: "Pick one option from a list.",
    template: `<Select>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Choose an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option-1">Option 1</SelectItem>
    <SelectItem value="option-2">Option 2</SelectItem>
  </SelectContent>
</Select>`,
  },
  {
    id: "checkbox",
    label: "Checkbox",
    group: "inputs",
    description: "A labelled on/off choice.",
    template: `<Stack direction="horizontal" className="items-center gap-2">
  <Checkbox />
  <Label>Checkbox label</Label>
</Stack>`,
  },
  {
    id: "switch",
    label: "Switch",
    group: "inputs",
    description: "A labelled on/off toggle.",
    template: `<Stack direction="horizontal" className="items-center gap-2">
  <Switch />
  <Label>Switch label</Label>
</Stack>`,
  },
  {
    id: "form",
    label: "Form",
    group: "inputs",
    description: "Labelled fields and a submit button. The agent wires up validation and submit.",
    template: `<form className="flex flex-col gap-4">
  <Stack className="gap-2">
    <Label>Name</Label>
    <Input placeholder="Jane Doe" />
  </Stack>
  <Stack className="gap-2">
    <Label>Email</Label>
    <Input type="email" placeholder="jane@example.com" />
  </Stack>
  <Button type="submit">Submit</Button>
</form>`,
  },

  // Display
  {
    id: "card",
    label: "Card",
    group: "display",
    description: "Titled surface for grouped content.",
    template: `<Card>
  <CardHeader>
    <CardTitle>Card title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent />
</Card>`,
  },
  { id: "badge", label: "Badge", group: "display", description: "Small status label.", template: `<Badge>Badge</Badge>` },
  {
    id: "avatar",
    label: "Avatar",
    group: "display",
    description: "Round picture with initials as fallback.",
    template: `<Avatar>
  <AvatarFallback>AB</AvatarFallback>
</Avatar>`,
  },
  {
    id: "table",
    label: "Table",
    group: "display",
    description: "Rows and columns of data.",
    template: `<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>`,
  },
  {
    id: "tabs",
    label: "Tabs",
    group: "display",
    description: "Switch between panels.",
    template: `<Tabs defaultValue="tab-1">
  <TabsList>
    <TabsTrigger value="tab-1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab-2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab-1" />
  <TabsContent value="tab-2" />
</Tabs>`,
  },
  { id: "separator", label: "Separator", group: "display", description: "Thin dividing line.", template: `<Separator />` },

  // Overlay
  {
    id: "dialog",
    label: "Dialog",
    group: "overlay",
    description: "Modal window, opened by its trigger button.",
    template: `<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`,
  },
  {
    id: "sheet",
    label: "Sheet",
    group: "overlay",
    description: "Panel that slides in from an edge, opened by its trigger button.",
    template: `<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline">Open sheet</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Sheet title</SheetTitle>
      <SheetDescription>Sheet description</SheetDescription>
    </SheetHeader>
  </SheetContent>
</Sheet>`,
  },
  {
    id: "dropdown-menu",
    label: "Dropdown Menu",
    group: "overlay",
    description: "Menu of actions, opened by its trigger button.",
    template: `<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Open menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Menu</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
  },
  {
    id: "toast",
    label: "Toast",
    group: "overlay",
    description: "Brief notification, fired from code.",
    template: null,
    note: "Toasts are shown by code (toast(\"…\")), and the Toaster is already mounted in main.tsx. Place the Button that should show one and ask the agent to wire it up.",
  },

  // Navigation
  {
    id: "sidebar",
    label: "Sidebar",
    group: "navigation",
    description: "Side navigation with a menu, beside the page content.",
    template: `<SidebarProvider className="min-h-0">
  <Sidebar collapsible="none">
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>Home</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>Settings</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>
    <Stack className="gap-4 p-4" />
  </SidebarInset>
</SidebarProvider>`,
  },
];

/** Project file a palette import source lives in, e.g. "@/components/ui/card" → "src/components/ui/card.tsx". */
export function moduleFile(from: string): string {
  if (from === LAYOUT) return "src/components/layout/index.ts";
  if (!from.startsWith("@/")) throw new Error(`palette: unexpected import source ${from}`);
  return `src/${from.slice(2)}.tsx`;
}

/** Component names used in a template, in first-use order. */
export function templateComponents(template: string): string[] {
  const names: string[] = [];
  for (const m of template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    const name = m[1] as string;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** The imports a palette template needs, as `{ name, from }` pairs. Throws on an unknown component. */
export function templateImports(template: string): { name: string; from: string }[] {
  return templateComponents(template).map((name) => {
    const schema = ELEMENTS[name];
    if (!schema) throw new Error(`palette: template uses <${name}>, which has no element schema`);
    return { name, from: schema.from };
  });
}

/** Project files a palette item needs (its components' modules). */
export function templateFiles(template: string): string[] {
  return [...new Set(templateImports(template).map((i) => moduleFile(i.from)))];
}
