// Reasons on errors the user can meet (T8.3, ADR 013): a code and facts beside the
// unchanged technical message, so the UI can say it in plain words.

import { describe, expect, it } from "vitest";
import { addRoute, EditOpError, reasonOf, remove, setProp, setText, writeTokens } from "../src/index.js";

const page = `export default function HomePage() {
  return (
    <main data-ui-id="ui_main1">
      <button data-ui-id="ui_btn01" variant={kind} onClick={() => go()}>Go</button>
      <p data-ui-id="ui_p0001">{title}</p>
      {items.map((i) => (
        <span data-ui-id="ui_row01" key={i}>{i}</span>
      ))}
    </main>
  );
}
`;

const thrown = (f: () => unknown): unknown => {
  try {
    f();
  } catch (err) {
    return err;
  }
  throw new Error("expected it to throw");
};

describe("reasons on refusals (T8.3)", () => {
  it("keeps the technical message and adds a code with facts", () => {
    const err = thrown(() => setProp(page, "ui_btn01", "variant", "x"));
    expect(err).toBeInstanceOf(EditOpError);
    expect((err as Error).message).toBe('setProp(ui_btn01): prop "variant" carries agent logic and is protected');
    expect(reasonOf(err)).toEqual({ code: "agent-control", facts: { id: "ui_btn01", prop: "variant" } });
  });

  it("says when text is the agent's, or the element is in agent code", () => {
    expect(reasonOf(thrown(() => setText(page, "ui_p0001", "x")))).toEqual({ code: "agent-value", facts: { id: "ui_p0001" } });
    expect(reasonOf(thrown(() => remove(page, { id: "ui_row01" })))?.code).toBe("inside-agent-code");
    expect(reasonOf(thrown(() => setText(page, "ui_gone1", "x")))).toEqual({ code: "element-gone", facts: { id: "ui_gone1" } });
  });

  it("names pages and theme values by what the user typed", () => {
    const router = `import { createBrowserRouter } from "react-router";\nimport HomePage from "./pages/HomePage";\nexport const router = createBrowserRouter([{ path: "/", element: <HomePage /> }]);\n`;
    expect(reasonOf(thrown(() => addRoute(router, { path: "/Foo", component: "FooPage" })))).toEqual({ code: "bad-web-address", facts: { path: "/Foo" } });
    expect(reasonOf(thrown(() => addRoute(router, { path: "/", component: "OtherPage" })))).toEqual({ code: "web-address-taken", facts: { path: "/" } });
    expect(reasonOf(thrown(() => writeTokens(":root { --a: 1px; }", [{ name: "--b", value: "2px" }])))).toEqual({ code: "theme-value-missing", facts: { name: "--b" } });
  });

  it("finds a reason through causes, and none on an error without one", () => {
    const inner = thrown(() => setProp(page, "ui_btn01", "variant", "x"));
    expect(reasonOf(new Error("wrapped", { cause: inner }))?.code).toBe("agent-control");
    expect(reasonOf(new Error("plain"))).toBeNull();
    expect(reasonOf("text")).toBeNull();
  });
});
