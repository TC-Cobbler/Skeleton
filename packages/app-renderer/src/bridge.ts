// The renderer never touches the filesystem, git or the AST. It sends requests to
// main over the typed bridge from the preload.

import type {
  Channel,
  IpcError,
  RequestOf,
  ResponseOf,
} from "@skeleton/app-main/ipc";

export class BridgeError extends Error {
  constructor(readonly ipc: IpcError) {
    super(`${ipc.channel}: ${ipc.message}`);
    this.name = "BridgeError";
  }
}

/** Calls main and unwraps the result, throwing a BridgeError on failure. */
export async function call<C extends Channel>(
  channel: C,
  request: RequestOf<C>,
): Promise<ResponseOf<C>> {
  const result = await window.skeleton.invoke(channel, request);
  if (!result.ok) throw new BridgeError(result.error);
  return result.value;
}
