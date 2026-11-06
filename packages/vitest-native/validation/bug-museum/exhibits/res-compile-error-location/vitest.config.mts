import { defineConfig } from "vitest/config";

// The outer project only runs the inner one (fixture/); it needs no plugin.
export default defineConfig({
  test: { include: ["outer.test.ts"], testTimeout: 150_000 },
});
