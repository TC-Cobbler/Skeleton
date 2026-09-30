import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "overlay",
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});
