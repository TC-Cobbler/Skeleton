import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "templates",
    include: ["tests/**/*.test.ts"],
  },
});
