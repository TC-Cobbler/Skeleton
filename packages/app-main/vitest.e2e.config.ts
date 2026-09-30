import { defineProject } from "vitest/config";

// Launches the built Electron app. Needs a display (xvfb-run on headless Linux).
export default defineProject({
  test: {
    name: "app-main-e2e",
    include: ["e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
