import { defineConfig } from "vitest/config";
import scale from "./vitest.scale.mts";

export default defineConfig({
  ...scale,
  test: {
    ...scale.test,
    maxWorkers: 2,
    minWorkers: 2,
    fileParallelism: true,
  },
});
