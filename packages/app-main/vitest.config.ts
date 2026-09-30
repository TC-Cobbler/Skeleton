import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "app-main",
    include: ["tests/**/*.test.ts"],
  },
});
