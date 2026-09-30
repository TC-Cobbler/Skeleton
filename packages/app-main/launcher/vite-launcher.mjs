// Starts the project's own Vite with Skeleton's dev plugin added (ADR 006).
// Usage: <node or Electron-as-Node> vite-launcher.mjs <projectRoot> <port> <overlayBundle>

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { skeletonPlugin } from "./skeleton-plugin.mjs";

const [root, portArg, overlayBundle] = process.argv.slice(2);
if (!root || !portArg || !overlayBundle) {
  console.error("usage: vite-launcher.mjs <projectRoot> <port> <overlayBundle>");
  process.exit(2);
}

const require = createRequire(path.join(root, "package.json"));
let vitePath;
try {
  vitePath = require.resolve("vite");
} catch {
  console.error("Vite isn't installed in this project (no node_modules/vite); run pnpm install");
  process.exit(1);
}
const { createServer } = await import(pathToFileURL(vitePath).href);

// The project's vite.config.* is loaded as usual; this plugin is appended to it.
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: Number(portArg), strictPort: true, open: false },
  plugins: [skeletonPlugin({ root, overlayBundle })],
});
await server.listen();
server.printUrls();

const shutdown = () => {
  server.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
