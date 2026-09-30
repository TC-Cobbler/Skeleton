import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkeletonBridge } from "@skeleton/app-main/ipc";
import { BridgeError, call } from "../src/bridge.js";

function stubBridge(invoke: SkeletonBridge["invoke"]): void {
  vi.stubGlobal("window", { skeleton: { invoke } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("call", () => {
  it("unwraps an ok result", async () => {
    const invoke = vi.fn(async () => ({
      ok: true as const,
      value: { roots: [], rootError: null },
    }));
    stubBridge(invoke as unknown as SkeletonBridge["invoke"]);
    await expect(
      call("page:tree", { projectRoot: "/p", file: "src/pages/Home.tsx" }),
    ).resolves.toEqual({
      roots: [],
      rootError: null,
    });
    expect(invoke).toHaveBeenCalledWith("page:tree", {
      projectRoot: "/p",
      file: "src/pages/Home.tsx",
    });
  });

  it("throws a BridgeError carrying the IPC error", async () => {
    const error = {
      code: "not-found" as const,
      channel: "page:tree",
      message: "no such page: x.tsx",
    };
    stubBridge((async () => ({
      ok: false,
      error,
    })) as unknown as SkeletonBridge["invoke"]);
    const promise = call("page:tree", { projectRoot: "/p", file: "x.tsx" });
    await expect(promise).rejects.toBeInstanceOf(BridgeError);
    await expect(promise).rejects.toMatchObject({
      ipc: error,
      message: "page:tree: no such page: x.tsx",
    });
  });
});
