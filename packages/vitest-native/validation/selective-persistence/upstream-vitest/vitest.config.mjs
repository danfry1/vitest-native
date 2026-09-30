import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    include: ["validation/selective-persistence/upstream-vitest/*.test.mjs"],
    runner: new URL("./runner.mjs", import.meta.url).pathname,
    sequence: process.env.VN_SHUFFLE_SEED
      ? {
          seed: Number(process.env.VN_SHUFFLE_SEED),
          shuffle: { files: true },
        }
      : undefined,
  },
});
