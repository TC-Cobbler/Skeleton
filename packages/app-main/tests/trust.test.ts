import { describe, expect, it } from "vitest";
import { isTrustedSender } from "../src/ipc/trust.js";

describe("isTrustedSender", () => {
  const dev = { kind: "url", url: "http://localhost:5199/" } as const;
  const built = {
    kind: "file",
    path: "/app/packages/app-renderer/dist/index.html",
  } as const;

  it("trusts the dev renderer's origin", () => {
    expect(isTrustedSender("http://localhost:5199/index.html#x", dev)).toBe(
      true,
    );
  });

  it("refuses another origin, e.g. the user's project dev server", () => {
    expect(isTrustedSender("http://localhost:5173/", dev)).toBe(false);
    expect(isTrustedSender("http://127.0.0.1:5199/", dev)).toBe(false);
  });

  it("trusts only the built renderer file", () => {
    expect(
      isTrustedSender(
        "file:///app/packages/app-renderer/dist/index.html",
        built,
      ),
    ).toBe(true);
    expect(isTrustedSender("file:///tmp/evil.html", built)).toBe(false);
    expect(isTrustedSender("http://localhost:5199/", built)).toBe(false);
  });

  it("refuses a missing or malformed sender URL", () => {
    expect(isTrustedSender(undefined, dev)).toBe(false);
    expect(isTrustedSender("", dev)).toBe(false);
    expect(isTrustedSender("not a url", built)).toBe(false);
  });
});
