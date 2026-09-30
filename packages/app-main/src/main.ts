// Electron main process. Owns the filesystem, git, child processes and all AST work
// (through @skeleton/core). The renderer reaches it only through ipc/contract.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { createDispatch } from "./ipc/handlers.js";
import { registerIpc } from "./ipc/register.js";
import type { RendererLocation } from "./ipc/trust.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Dev: the renderer's Vite server (set by scripts/dev.ts). Otherwise its built files. */
function rendererLocation(): RendererLocation {
  const devUrl = process.env["SKELETON_RENDERER_URL"];
  if (devUrl) return { kind: "url", url: devUrl };
  return {
    kind: "file",
    path: path.resolve(here, "../../app-renderer/dist/index.html"),
  };
}

function createWindow(renderer: RendererLocation): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Skeleton",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // The Skeleton window never navigates away or opens windows; links go to the browser.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (renderer.kind === "url") void win.loadURL(renderer.url);
  else void win.loadFile(renderer.path);
  return win;
}

const renderer = rendererLocation();
const log = (
  error: { code: string; channel: string; message: string },
  cause?: unknown,
): void => {
  console.error(
    `[ipc] ${error.channel}: ${error.code}: ${error.message}`,
    cause ?? "",
  );
};

const dispatch = createDispatch(
  {
    appInfo: () => ({
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
    }),
    readFile: (absolutePath) => readFile(absolutePath, "utf8"),
  },
  log,
);

// Not top-level await: Playwright's Electron launcher (the e2e suite) hangs on it.
void app.whenReady().then(() => {
  registerIpc(dispatch, renderer, log);
  createWindow(renderer);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(renderer);
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
