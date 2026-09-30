import path from "node:path";
import { defineConfig } from "vitest/config";
import idiomatic from "./vitest.idiomatic.mts";

export default defineConfig({
  ...idiomatic,
  test: {
    ...idiomatic.test,
    include: [path.resolve("validation/idiomatic/scale/generated/*.test.tsx")],
  },
});
