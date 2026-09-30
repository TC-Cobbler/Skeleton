// Runs sandboxed, so it can only require "electron". Exposes exactly one function:
// window.skeleton.invoke(channel, request). Main validates both.

import electron = require("electron");
import type { SkeletonBridge } from "./ipc/contract.js" with {
  "resolution-mode": "import",
};

// Keep in sync with INVOKE_CHANNEL in ipc/register.ts (the sandbox can't import it).
const INVOKE_CHANNEL = "skeleton:invoke";

const { contextBridge, ipcRenderer } = electron;

const bridge: SkeletonBridge = {
  invoke: (channel, request) =>
    ipcRenderer.invoke(INVOKE_CHANNEL, channel, request),
};

contextBridge.exposeInMainWorld("skeleton", bridge);
