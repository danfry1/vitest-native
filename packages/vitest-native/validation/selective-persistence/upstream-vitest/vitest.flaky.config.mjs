import { defineConfig } from "vitest/config";
import AlphabeticalSequencer from "./alphabetical-sequencer.mjs";

export default defineConfig({
  test: {
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    include: ["validation/selective-persistence/upstream-vitest/flaky/*.test.mjs"],
    runner: new URL("./runner.mjs", import.meta.url).pathname,
    sequence: {
      sequencer: AlphabeticalSequencer,
    },
  },
});
