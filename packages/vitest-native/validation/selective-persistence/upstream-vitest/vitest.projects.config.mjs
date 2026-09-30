import { defineConfig } from "vitest/config";

const include = ["validation/selective-persistence/upstream-vitest/*.test.mjs"];
const runner = new URL("./runner.mjs", import.meta.url).pathname;

const project = (name) => ({
  test: {
    name,
    isolate: false,
    include,
    runner,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
  },
});

export default defineConfig({
  test: {
    projects: [project("selective-a"), project("selective-b")],
  },
});
