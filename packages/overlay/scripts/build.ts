// Bundles the overlay into dist/overlay.js (one ES module, no imports).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await build({
  entryPoints: [`${root}src/entry.ts`],
  outfile: `${root}dist/overlay.js`,
  bundle: true,
  format: "esm",
  target: "es2022",
  legalComments: "none",
  banner: { js: "// Skeleton overlay (dev only). Injected by Skeleton's Vite plugin; not part of your project." },
});
