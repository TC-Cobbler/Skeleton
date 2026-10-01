// Gate 5: PRD flows F4 (hand off), F5 (take back) and F6 (adjust after the agent), on
// a newly created project, driven through the UI. The agent's pass is scripted: it
// writes files the way Claude Code does in the Phase 0 loop (docs/spike-log.md).
//
// - F4: pin a Build note on the Table → Hand off → commit created, HANDOFF.md lists
//   the task, canvas locked.
// - F5: the agent implements data fetching and ticks the task. Take back → the canvas
//   shows the Table rendering live data, the data-bearing part is a locked block, the
//   note is resolved, the agent's reply is pinned, and the Table's ID is intact.
// - F6: change --radius-card and move the Table to a different Stack: the agent's hooks
//   and logic are byte-identical afterwards, apart from the moved JSX.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { buildTree, findNodeById, readNotes, readTokens, sourceVersion, walkTree, type UiNode } from "@skeleton/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canvasFrame, canvasPoint, waitForCanvas } from "./canvas-click.js";
import { copy, names, startsWith, ui } from "./ui.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(path.join(tmpdir(), "skeleton-gate5-"));

let app: ElectronApplication;
let page: Page;
const projectRoot = path.join(scratch, "gate-five");
const HOME = "src/pages/HomePage.tsx";
const read = (rel: string) => readFileSync(path.join(projectRoot, rel), "utf8");
/** Written as an editor or agent would: atomically, so Vite never reads a half-written file. */
const write = (rel: string, content: string) => {
  const abs = path.join(projectRoot, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.agent.tmp`);
  writeFileSync(tmp, content);
  renameSync(tmp, abs);
};
const git = (...args: string[]) => execFileSync("git", ["-C", projectRoot, ...args], { encoding: "utf8" });
const subjects = () => git("log", "--format=%s").trim().split("\n");
const frame = () => canvasFrame(page);
const tree = () => buildTree(read(HOME)).roots;
const node = (id: string) => findNodeById(tree(), id);
const loopState = () => page.getByTestId("loop-state").textContent();
const tab = (name: RegExp) => page.getByRole("tab", { name });

const IDS = {
  left: "ui_left0",
  right: "ui_right",
  card: "ui_card0",
  content: "ui_cdc00",
  table: "ui_tabl0",
  body: "ui_tbd00",
  para: "ui_para0",
};

/** The agent's code, as the pass leaves it. */
const AGENT = {
  api: `export interface Order {\n  id: string;\n  customer: string;\n}\n\nconst ORDERS: Order[] = [\n  { id: "#1001", customer: "Ada Lovelace" },\n  { id: "#1002", customer: "Grace Hopper" },\n  { id: "#1003", customer: "Linus Torvalds" },\n];\n\n/** Stands in for GET /api/orders. */\nexport function fetchOrders(): Promise<Order[]> {\n  return new Promise((resolve) => setTimeout(() => resolve(ORDERS), 50));\n}\n`,
  hook: `import { useEffect, useState } from "react";\nimport { fetchOrders, type Order } from "@/lib/orders-api";\n\nexport function useOrders(): { orders: Order[]; loading: boolean } {\n  const [orders, setOrders] = useState<Order[]>([]);\n  const [loading, setLoading] = useState(true);\n  useEffect(() => {\n    let live = true;\n    void fetchOrders().then((next) => {\n      if (!live) return;\n      setOrders(next);\n      setLoading(false);\n    });\n    return () => {\n      live = false;\n    };\n  }, []);\n  return { orders, loading };\n}\n`,
  importLine: 'import { useOrders } from "@/hooks/use-orders";',
  hookCall: "  const { orders } = useOrders();",
  rows: [
    "                  {orders.map((order) => (",
    // The placeholder row becomes the row template, keeping its IDs (contract rule 1).
    '                    <TableRow key={order.id} data-ui-id="ui_tbr00">',
    '                      <TableCell data-ui-id="ui_tc000">{order.id}</TableCell>',
    '                      <TableCell data-ui-id="ui_tc001">{order.customer}</TableCell>',
    "                    </TableRow>",
    "                  ))}",
  ],
};

beforeAll(async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== "SKELETON_RENDERER_URL",
    ),
  );
  app = await _electron.launch({
    args: [pkgRoot, ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    cwd: pkgRoot,
    env: { ...env, SKELETON_USER_DATA: path.join(scratch, "profile") },
  });
  page = await app.firstWindow();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, scratch);
  await ui(page).picker.changeFolder().click();
  await ui(page).picker.projectName().fill("Gate Five");
  await ui(page).picker.create().click();
  await frame().getByRole("heading", { name: "Gate Five" }).waitFor({ timeout: 90_000 });
  // Two Stacks; a Table with a placeholder row in a Card in the first. Gate 3 covers
  // building a page from the palette; here it's written, as in Gate 4.
  const source = read(HOME)
    .replace(
      'import { Container, Stack } from "@/components/layout";',
      [
        'import { Container, Stack } from "@/components/layout";',
        'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";',
        'import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";',
      ].join("\n"),
    )
    .replace(
      "        </h1>\n",
      [
        "        </h1>",
        `        <Stack data-ui-id="${IDS.left}" className="gap-4">`,
        `          <Card data-ui-id="${IDS.card}">`,
        `            <CardHeader data-ui-id="ui_cdh00">`,
        `              <CardTitle data-ui-id="ui_cdt00">Orders</CardTitle>`,
        "            </CardHeader>",
        `            <CardContent data-ui-id="${IDS.content}">`,
        `              <Table data-ui-id="${IDS.table}">`,
        `                <TableHeader data-ui-id="ui_thd00">`,
        `                  <TableRow data-ui-id="ui_thr00">`,
        `                    <TableHead data-ui-id="ui_th000">Order</TableHead>`,
        `                    <TableHead data-ui-id="ui_th001">Customer</TableHead>`,
        "                  </TableRow>",
        "                </TableHeader>",
        `                <TableBody data-ui-id="${IDS.body}">`,
        `                  <TableRow data-ui-id="ui_tbr00">`,
        `                    <TableCell data-ui-id="ui_tc000">#0</TableCell>`,
        `                    <TableCell data-ui-id="ui_tc001">Placeholder</TableCell>`,
        "                  </TableRow>",
        "                </TableBody>",
        "              </Table>",
        "            </CardContent>",
        "          </Card>",
        "        </Stack>",
        `        <Stack data-ui-id="${IDS.right}" className="gap-4">`,
        `          <p data-ui-id="${IDS.para}">Second stack</p>`,
        "        </Stack>",
        "",
      ].join("\n"),
    );
  write(HOME, source);
  await waitForCanvas(page, sourceVersion(source), "canvas-desktop");
  // The page as the user left it, committed like any work before a first handoff.
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "user: orders page");
  await ui(page).showLayers();
}, 180_000);

afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("Gate 5", () => {
  it("F4: pin a Build note on the Table, hand off: commit, HANDOFF.md task, canvas locked", async () => {
    await page.getByTestId(`layer-${IDS.table}`).click();
    expect(await page.getByTestId("selection-id").textContent()).toBe(IDS.table);
    await tab(startsWith(copy.app.tabs.element())).click();
    const form = ui(page).addNote();
    await form.getByLabel(copy.notes.type).selectOption("build");
    await form.getByLabel(copy.notes.text).fill("Load orders from /api/orders");
    await form.getByRole("button", { name: copy.notes.add }).click();
    await expect.poll(() => readNotes(read("skeleton/notes.json")).notes.map((n) => [n.target, n.type, n.text, n.status])).toEqual([
      [IDS.table, "build", "Load orders from /api/orders", "open"],
    ]);
    // Pinned on the canvas.
    await expect.poll(() => frame().locator(`skeleton-overlay [data-pin]`).first().textContent(), { timeout: 10_000 }).toBe("1");

    await ui(page).handOff().click();
    await expect.poll(loopState, { timeout: 120_000 }).toBe(copy.loop.withAgent(1));
    expect(subjects()[0]).toBe("skeleton: handoff #1");
    expect(git("status", "--porcelain")).toBe("");
    const handoff = read("HANDOFF.md");
    expect(handoff).toMatch(/^# Handoff #1 — \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n/);
    expect(handoff).toContain(`## Tasks\n- [ ] ${IDS.table} · Build · Load orders from /api/orders\n`);
    expect(handoff).toContain("## Agent replies\n<!-- Agent: tick tasks above and add replies here, keyed by data-ui-id -->");
    // Locked: the canvas is veiled, the palette and edits are off.
    await page.getByTestId("agent-veil").waitFor();
    expect(await ui(page).undo().isDisabled()).toBe(true);
    expect(await ui(page).handOff().count()).toBe(0);
    expect(await ui(page).addNote().count()).toBe(0);
  }, 180_000);

  it("F5: the agent fetches data and ticks the task; take back shows it live, locked, resolved and replied", async () => {
    // The agent's pass.
    write("src/lib/orders-api.ts", AGENT.api);
    write("src/hooks/use-orders.ts", AGENT.hook);
    const home = read(HOME);
    const placeholder = /\n {18}<TableRow data-ui-id="ui_tbr00">[\s\S]*?<\/TableRow>/.exec(home)?.[0] as string;
    write(
      HOME,
      home
        .replace('import { Container, Stack } from "@/components/layout";', `import { Container, Stack } from "@/components/layout";\n${AGENT.importLine}`)
        .replace("export default function HomePage() {\n", `export default function HomePage() {\n${AGENT.hookCall}\n`)
        .replace(placeholder, `\n${AGENT.rows.join("\n")}`),
    );
    write(
      "HANDOFF.md",
      read("HANDOFF.md")
        .replace(`- [ ] ${IDS.table} · Build`, `- [x] ${IDS.table} · Build`)
        .concat(`- ${IDS.table} · Loads via useOrders() (src/hooks/use-orders.ts); the row template keeps ui_tbr00\n`),
    );

    await ui(page).takeBack().click();
    await expect.poll(loopState, { timeout: 120_000 }).toBe(copy.loop.withYou);
    expect(subjects()[0]).toBe("agent: pass #1");
    await page.getByTestId("agent-veil").waitFor({ state: "detached" });

    // The pass summary: task done, no breaches, nothing to repair, the build passes.
    const summary = page.getByTestId("pass-summary");
    await summary.waitFor();
    expect(await page.getByTestId("pass-tasks").textContent()).toContain(copy.pass.tasks(1, 1, 0));
    expect(await page.getByTestId("pass-build").textContent()).toMatch(startsWith(copy.pass.buildPassed));
    expect(await page.getByTestId("pass-breaches").locator("summary").textContent()).toBe(`${copy.pass.groups.breaches} (0)`);
    expect(await page.getByTestId("pass-repairs").locator("summary").textContent()).toBe(`${copy.pass.groups.repaired} (0)`);
    expect(await page.getByTestId("pass-locked").textContent()).toContain(names.agentCodeKind("map", ".map() loop"));
    // The per-file diff against the handoff (T5.7).
    await page.getByTestId("pass-diffs").getByRole("button", { name: HOME }).click();
    expect(await page.getByTestId("patch").textContent()).toContain(`+${AGENT.hookCall}`);

    // The canvas renders live data.
    await frame().getByText("Grace Hopper").waitFor({ timeout: 20_000 });
    expect(await frame().getByText("Placeholder").count()).toBe(0);
    // The data-bearing part is a locked block.
    const locked: UiNode[] = [];
    walkTree(tree(), (n) => void (n.kind === "locked" && locked.push(n)));
    // One data-bearing block: the .map in the TableBody. The row's own expressions
    // ({order.id}) are locked too, inside it.
    const block = node(IDS.body)?.children[0];
    expect([block?.kind, block?.lockReason]).toEqual(["locked", ".map() loop"]);
    for (const n of locked) expect(n.range.start >= (block?.range.start ?? 0) && n.range.end <= (block?.range.end ?? 0), n.name).toBe(true);
    await expect.poll(() => frame().locator("skeleton-overlay .label", { hasText: "🔒 .map()" }).count(), { timeout: 10_000 }).toBeGreaterThan(0);
    // The Table's ID is intact, in the code and on the canvas.
    expect(node(IDS.table)?.name).toBe("Table");
    expect(await frame().locator(`table[data-ui-id="${IDS.table}"]`).count()).toBe(1);

    // The note is resolved and the reply pinned to the Table.
    expect(readNotes(read("skeleton/notes.json")).notes[0]?.status).toBe("resolved");
    await ui(page).openWorkspace("handoff");
    await page.getByRole("group", { name: copy.notes.status }).getByRole("button", { name: copy.notes.all }).click();
    const note = page.getByTestId("note").first();
    expect(await note.getByTestId("note-status").textContent()).toBe(copy.notes.resolvedStatus);
    expect(await note.getByTestId("note-reply").textContent()).toBe(`${copy.notes.agentReply(1)} Loads via useOrders() (src/hooks/use-orders.ts); the row template keeps ui_tbr00`);
    await expect.poll(() => frame().locator("skeleton-overlay [data-pin]").first().textContent(), { timeout: 10_000 }).toBe("✓ ↩");
  }, 180_000);

  it("F6: change --radius-card and move the Table to the other Stack; the agent's logic is byte-identical", async () => {
    const hookBefore = read("src/hooks/use-orders.ts");
    const apiBefore = read("src/lib/orders-api.ts");
    const pageBefore = read(HOME);
    const cssBefore = read("src/styles/globals.css");
    const token = (css: string) => readTokens(css).find((t) => t.name === "--radius-card")?.value;

    // --radius-card, in the token panel.
    await tab(startsWith(copy.app.tabs.tokens())).click();
    const input = ui(page).tokens().getByTestId("token---radius-card").getByLabel(copy.tokens.valueLabel(names.themeName("--radius-card")));
    await input.fill("calc(var(--radius) * 2)");
    await input.press("Enter");
    await expect.poll(() => token(read("src/styles/globals.css"))).toBe("calc(var(--radius) * 2)");
    const cssLines = (css: string) => css.split("\n");
    const changedCss = cssLines(read("src/styles/globals.css")).filter((l, i) => l !== cssLines(cssBefore)[i]);
    expect(changedCss).toEqual(["  --radius-card: calc(var(--radius) * 2);"]);

    // The Table, into the second Stack after its paragraph: select it, drag it by its label.
    await ui(page).showLayers();
    await tab(startsWith(copy.app.tabs.element())).click();
    await page.getByTestId(`layer-${IDS.table}`).click();
    const grip = frame().locator(`skeleton-overlay [data-grab]`);
    await grip.waitFor();
    const from = await canvasPoint(page, "canvas-frame", grip);
    const to = await canvasPoint(page, "canvas-frame", frame().locator(`[data-ui-id="${IDS.para}"]`), { fx: 0.5, fy: 0.9 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    // Release once the host has answered with the drop target (it can take longer than a frame).
    await frame().locator("skeleton-overlay [data-drop-indicator]").first().waitFor();
    await page.mouse.up();
    await expect.poll(() => node(IDS.right)?.children.map((c) => c.id), { timeout: 15_000 }).toEqual([IDS.para, IDS.table]);
    expect(node(IDS.content)?.children).toEqual([]);

    // The agent's hook and API are untouched; the page differs only by the moved JSX.
    expect(read("src/hooks/use-orders.ts")).toBe(hookBefore);
    expect(read("src/lib/orders-api.ts")).toBe(apiBefore);
    const pageAfter = read(HOME);
    expect(pageAfter).toContain(`${AGENT.importLine}\n`);
    expect(pageAfter).toContain(`export default function HomePage() {\n${AGENT.hookCall}\n`);
    // Every line of the Table's JSX is still there verbatim, only re-indented (it moved
    // two levels up); the agent's .map rows included. Nothing else changed.
    const tableOf = (src: string) => {
      const r = findNodeById(buildTree(src).roots, IDS.table)?.range;
      return r ? src.split("\n").slice(r.startLine - 1, r.endLine) : [];
    };
    const moved = tableOf(pageAfter);
    expect(moved.map((l) => l.trim())).toEqual(tableOf(pageBefore).map((l) => l.trim()));
    for (const row of AGENT.rows) expect(moved.map((l) => l.trim())).toContain(row.trim());
    const withoutTable = (src: string) => {
      const lines = src.split("\n");
      const r = findNodeById(buildTree(src).roots, IDS.table)?.range;
      return r ? [...lines.slice(0, r.startLine - 1), ...lines.slice(r.endLine)] : lines;
    };
    const rest = withoutTable(pageAfter);
    const restBefore = withoutTable(pageBefore);
    // Outside the Table, only the emptied CardContent changed: it closes on one line.
    expect(rest.filter((l) => !restBefore.includes(l))).toEqual(['            <CardContent data-ui-id="ui_cdc00"></CardContent>']);
    expect(restBefore.filter((l) => !rest.includes(l))).toEqual(['            <CardContent data-ui-id="ui_cdc00">', "            </CardContent>"]);
    // Live data still renders from the moved Table.
    await frame().getByText("Grace Hopper").waitFor({ timeout: 20_000 });
    await expect.poll(() => frame().locator(`[data-ui-id="${IDS.right}"] table[data-ui-id="${IDS.table}"]`).count(), { timeout: 20_000 }).toBe(1);
  }, 180_000);
});
