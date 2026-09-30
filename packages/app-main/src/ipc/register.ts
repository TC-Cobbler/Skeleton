// Wires the dispatcher to Electron's ipcMain, with a sender check in front of it.

import { ipcMain } from "electron";
import type { IpcError } from "./contract.js";
import type { Dispatch } from "./handlers.js";
import { isTrustedSender, type RendererLocation } from "./trust.js";

/** The single channel the preload invokes; the contract channel travels as data. */
export const INVOKE_CHANNEL = "skeleton:invoke";

export function registerIpc(
  dispatch: Dispatch,
  renderer: RendererLocation,
  log: (error: IpcError) => void,
): void {
  ipcMain.handle(
    INVOKE_CHANNEL,
    async (event, channel: unknown, request: unknown) => {
      if (!isTrustedSender(event.senderFrame?.url, renderer)) {
        const error: IpcError = {
          code: "untrusted-sender",
          channel: String(channel),
          message: `refused call from ${event.senderFrame?.url ?? "an unknown frame"}`,
        };
        log(error);
        return { ok: false, error };
      }
      return dispatch(channel, request);
    },
  );
}
