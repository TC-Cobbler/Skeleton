import { describe, expect, it } from "vitest";
import { isUiId } from "../src/index.js";

describe("isUiId", () => {
  it("accepts ui_ + 5 lowercase alphanumerics", () => {
    expect(isUiId("ui_k3m9x")).toBe(true);
  });

  it.each(["ui_K3M9X", "ui_k3m9", "ui_k3m9xx", "k3m9x", "ui-k3m9x", ""])(
    "rejects %j",
    (value) => {
      expect(isUiId(value)).toBe(false);
    },
  );
});
