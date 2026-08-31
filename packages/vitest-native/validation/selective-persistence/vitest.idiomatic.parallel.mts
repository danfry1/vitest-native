import { defineConfig } from "vitest/config";
import idiomatic from "./vitest.idiomatic.mts";

export default defineConfig({
  ...idiomatic,
  test: {
    ...idiomatic.test,
    maxWorkers: 2,
    minWorkers: 2,
    fileParallelism: true,
  },
});
