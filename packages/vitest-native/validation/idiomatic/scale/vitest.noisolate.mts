// NEGATIVE CONTROL: native engine with isolate:false but WITHOUT the hot runtime,
// so there is NO per-file module/state reset. The store-reset probe fails here
// consistently (~14x), demonstrating it detects real cross-file bleed; hot, which
// schedules like isolate:false but DOES reset per file, does not fail it. (The
// listener-accumulation checker is order/cleanup-timing dependent and is a smoke
// test, not a reliable sensitivity probe — see validation/idiomatic/README.md.)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: {
    globals: true,
    environment: "node",
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    include: [path.resolve(here, "generated/*.test.tsx")],
  },
});
