import { describe, expect, it } from "vitest";
import { REASON_CODES, type Reason } from "../../core/src/reasons.js";
import { BridgeError } from "../src/bridge.js";
import { copy } from "../src/copy.js";
import { messageFor, named, say, tierOf } from "../src/messages.js";

const facts = { id: "ui_btn01", prop: "onClick", page: "src/pages/LibraryPage.tsx", path: "/stats", name: "StatsPage", round: 3, max: 2000, edit: "Insert Badge", direction: "undo", folder: "/home/j/games", parent: "/library", value: "rounded-[7px]", where: "x" };
const elements = (id: string) => (id === "ui_btn01" ? 'Button "Add game"' : null);
const error = (reason: Reason | null, code: "edit-refused" | "failed" = "edit-refused") =>
  new BridgeError({ code, channel: "page:edit", message: "setProp(ui_btn01): prop \"onClick\" carries agent logic and is protected", reason });

describe("plain messages (T8.3)", () => {
  it("has a sentence for every reason code", () => {
    for (const code of REASON_CODES) {
      const text = say({ code, facts }, { element: elements });
      expect(text, code).toMatch(/^\S.*\.$/s);
      expect(text, code).not.toMatch(/undefined|NaN|\[object/);
    }
    expect(Object.keys(copy.messages).sort()).toEqual([...REASON_CODES].sort());
  });

  it("names elements, pages and folders in plain words", () => {
    const n = named(facts, { element: elements });
    expect(n.el).toBe('Button "Add game"');
    expect(n.page).toBe("Library");
    expect(n.folder).toBe("games");
    expect(named({ name: "OrderHistoryPage" }).name).toBe("Order History");
    expect(named({ id: "ui_gone1" }).el).toBe(copy.named.thatElement);
  });

  it("words an error by its reason, keeping the technical text for Details", () => {
    const m = messageFor(error({ code: "agent-control", facts: { id: "ui_btn01", prop: "onClick" } }), { element: elements, page: "src/pages/HomePage.tsx" });
    expect(m.text).toBe(copy.messages["agent-control"](named({ id: "ui_btn01" }, { element: elements })));
    expect(m.tier).toBe("refusal");
    expect(m.details).toContain("carries agent logic");
    expect(m.copy).toContain('data-ui-id="ui_btn01"');
    expect(m.copy).toContain("Page file: src/pages/HomePage.tsx");
    expect(m.copy).toContain("Reason: agent-control");
  });

  it("offers Undo for problems the last change may have caused", () => {
    expect(tierOf("build-broken")).toBe("problem");
    expect(messageFor(error({ code: "build-broken", facts: {} })).actions).toEqual(["undo"]);
    expect(tierOf("only-page")).toBe("refusal");
  });

  it("says nothing changed for a refused fault, and points to Details otherwise", () => {
    expect(messageFor(error(null)).text).toBe(copy.fault.unchanged);
    expect(messageFor(error(null, "failed")).text).toBe(copy.fault.unknown);
    expect(messageFor(new Error("boom")).text).toBe(copy.fault.unknown);
    expect(messageFor(new Error("boom")).details).toBe("boom");
  });

  it("passes the renderer's own sentences through as they are", () => {
    const m = messageFor(copy.nodes.first);
    expect(m).toMatchObject({ text: copy.nodes.first, tier: "refusal", details: null, copy: null });
  });
});
