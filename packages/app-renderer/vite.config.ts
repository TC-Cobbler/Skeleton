import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Workspace packages export their TypeScript source under the "source" condition.
  resolve: { conditions: ["source", "module", "browser", "development|production"] },
  // Relative asset URLs so the built index.html loads over file:// in Electron.
  base: "./",
  server: { port: 5199, strictPort: true },
  test: {
    name: "app-renderer",
    include: ["tests/**/*.test.ts"],
  },
});
