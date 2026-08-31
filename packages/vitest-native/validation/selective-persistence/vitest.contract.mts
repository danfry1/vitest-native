import { defineConfig } from "vitest/config";
import idiomatic from "./vitest.idiomatic.mts";

export default defineConfig({
  ...idiomatic,
  test: {
    ...idiomatic.test,
    include: [
      "validation/single-graph/smoke.test.tsx",
      "validation/selective-persistence/*.test.ts",
    ],
  },
});
