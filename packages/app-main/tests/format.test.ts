import { describe, expect, it } from "vitest";
import { collectIds, parseModule } from "@skeleton/core";
import { formatEdited } from "../src/project/format.js";

const page = (tag: string, rest = "") => `import { Button } from "@/components/ui/button";

export default function P() {
  return (
    <div data-ui-id="ui_root1">
      ${tag}${rest}
    </div>
  );
}
`;

describe("formatEdited (T3.7)", () => {
  it("formats a Skeleton-owned, text-only element that grew past the print width, and nothing else", async () => {
    const long = `<Button data-ui-id="ui_btn01" variant="outline" size="lg" className="w-full justify-between px-6 py-2" disabled>`;
    const src = page(long, `\n        Save\n      </Button>`);
    const out = await formatEdited(src, "ui_btn01", "/p/src/pages/P.tsx");
    expect(out).toContain(`      <Button
        data-ui-id="ui_btn01"
        variant="outline"
        size="lg"
        className="w-full justify-between px-6 py-2"
        disabled
      >
        Save
      </Button>`);
    expect(() => parseModule(out)).not.toThrow();
    expect(collectIds(out).ids.map(([id]) => id)).toEqual(collectIds(src).ids.map(([id]) => id));
    // Only the tag's lines changed.
    const before = src.split("\n");
    const after = out.split("\n");
    expect(after.slice(0, 5)).toEqual(before.slice(0, 5));
    expect(after.slice(-6)).toEqual(before.slice(-6));
  });

  it("keeps self-closing tags self-closing", async () => {
    const src = page(`<Button data-ui-id="ui_btn01" variant="outline" size="lg" className="w-full justify-between px-6" />`);
    const out = await formatEdited(src, "ui_btn01", "/p/src/pages/P.tsx");
    expect(out).toContain(`        className="w-full justify-between px-6"\n      />`);
  });

  it("follows Prettier: text goes on its own line once there's more than one attribute", async () => {
    const one = page(`<Button data-ui-id="ui_btn01">Go</Button>`);
    expect(await formatEdited(one, "ui_btn01", "/p/x.tsx")).toBe(one);
    const two = page(`<Button data-ui-id="ui_btn01" variant="outline">Go</Button>`);
    expect(await formatEdited(two, "ui_btn01", "/p/x.tsx")).toContain(`      <Button data-ui-id="ui_btn01" variant="outline">\n        Go\n      </Button>\n`);
  });

  it("leaves Prettier-shaped elements, tags with agent logic, and unknown IDs alone", async () => {
    const short = page(`<Button data-ui-id="ui_btn01" variant="outline">`, `\n        Go\n      </Button>`);
    expect(await formatEdited(short, "ui_btn01", "/p/x.tsx")).toBe(short);
    const logic = page(`<Button data-ui-id="ui_btn01" variant="outline" size="lg" className="w-full px-6 py-2" onClick={() => save()}>Go</Button>`);
    expect(await formatEdited(logic, "ui_btn01", "/p/x.tsx")).toBe(logic);
    expect(await formatEdited(short, "ui_nope0", "/p/x.tsx")).toBe(short);
  });

  it("formats an already multi-line tag back into shape after an attribute edit", async () => {
    const src = page(`<Button\n        data-ui-id="ui_btn01"\n        variant="outline" size="lg"\n      >`, `\n        Save\n      </Button>`);
    const out = await formatEdited(src, "ui_btn01", "/p/x.tsx");
    expect(out).toContain(`      <Button data-ui-id="ui_btn01" variant="outline" size="lg">\n        Save\n      </Button>`);
  });

  it("puts inline text on its own line when the tag wraps", async () => {
    const src = page(`<Button data-ui-id="ui_btn01" variant="outline" size="lg" className="w-full px-6 py-2" disabled>Save</Button>`);
    const out = await formatEdited(src, "ui_btn01", "/p/x.tsx");
    expect(out).toContain(`        disabled\n      >\n        Save\n      </Button>`);
  });

  it("formats only the opening tag when the element has child elements", async () => {
    const children = `\n        <b data-ui-id="ui_b0001">  keep   this  </b>\n      </div>`;
    const src = page(`<div data-ui-id="ui_div01" className="flex flex-col items-center justify-between gap-6 px-10 py-8">`, children);
    const out = await formatEdited(src, "ui_div01", "/p/x.tsx");
    expect(out).toContain(`      <div\n        data-ui-id="ui_div01"\n        className="flex flex-col items-center justify-between gap-6 px-10 py-8"\n      >${children}`);
  });
});
