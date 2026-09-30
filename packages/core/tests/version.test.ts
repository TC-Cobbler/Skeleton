import { describe, expect, it } from "vitest";
import { sourceVersion } from "../src/index.js";

describe("sourceVersion", () => {
  it("is a stable 14-digit hex fingerprint that changes with any edit", () => {
    const a = sourceVersion("export default function Page() {}\n");
    expect(a).toMatch(/^[0-9a-f]{14}$/);
    expect(sourceVersion("export default function Page() {}\n")).toBe(a);
    expect(sourceVersion("export default function Page() {} \n")).not.toBe(a);
    expect(sourceVersion("")).toMatch(/^[0-9a-f]{14}$/);
    // Non-ASCII text hashes by UTF-16 code unit, the same in Node and the browser.
    expect(sourceVersion("é")).not.toBe(sourceVersion("e"));
  });
});
