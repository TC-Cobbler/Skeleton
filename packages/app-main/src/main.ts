// Electron main process. Owns the filesystem, git, child processes and all AST work
// (through @skeleton/core). The renderer reaches it only through ipc/contract.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, shell } from "electron";
import { createDispatch } from "./ipc/handlers.js";
import { registerIpc } from "./ipc/register.js";
import { DevServerManager } from "./devserver/manager.js";
import { GitService } from "./git/service.js";
import { readProjectInfo, RecentProjects } from "./project/recent.js";
import { ProjectWatcher } from "./project/watcher.js";
import { scaffoldProject } from "./project/scaffold.js";
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

// Tests (and anyone wanting an isolated profile) can point user data elsewhere.
const userDataOverride = process.env["SKELETON_USER_DATA"];
if (userDataOverride) app.setPath("userData", userDataOverride);

const renderer = rendererLocation();
const devServers = new DevServerManager();
const watcher = new ProjectWatcher();
// Lazily: app paths are only valid once Electron has initialised.
let recentStore: RecentProjects | null = null;
const recent = () => (recentStore ??= new RecentProjects(path.join(app.getPath("userData"), "recent-projects.json")));
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
    createProject: (request) =>
      scaffoldProject(request, { skeletonVersion: app.getVersion() }),
    devServer: {
      start: (root) => devServers.start(root),
      stop: (root) => devServers.stop(root),
      status: (root, sinceSeq) => devServers.status(root, sinceSeq),
    },
    projects: {
      list: async () => ({
        recent: await recent().list(),
        defaultParentDir: path.join(app.getPath("documents"), "Skeleton"),
      }),
      info: readProjectInfo,
      touch: (project) => recent().touch(project),
      forget: async (root) => {
        await recent().forget(root);
        return recent().list();
      },
    },
    chooseFolder: async ({ title, defaultPath }) => {
      const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const options = {
        title,
        properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
        ...(defaultPath ? { defaultPath } : {}),
      };
      const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    git: new GitService(),
    changes: (root) => watcher.changes(root),
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
// Stop every project's Vite before quitting, so none are left running.
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  watcher.stopAll();
  devServers.stopAll().then(
    () => app.quit(),
    (cause: unknown) => {
      console.error("[devserver] failed to stop dev servers on quit", cause);
      app.quit();
    },
  );
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
