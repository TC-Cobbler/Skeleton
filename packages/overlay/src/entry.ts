// Bundle entry, served by Skeleton's dev plugin as a Vite module (so import.meta.hot
// exists). Only active when the app is framed by Skeleton.

import { Overlay } from "./overlay.js";

if (window.parent !== window) {
  const overlay = new Overlay({ win: window, host: window.parent });
  overlay.start();
  const hot = (import.meta as ImportMeta & { hot?: { on(event: string, cb: () => void): void } }).hot;
  hot?.on("vite:afterUpdate", () => overlay.notifyUpdated());
  hot?.on("vite:beforeFullReload", () => overlay.notifyUpdated());
}
