// NEGATIVE CONTROL: native engine with isolate:false but WITHOUT the hot runtime,
// so there is NO per-file module/state reset. The store and listener-accumulation
// probes MUST fail here — proving they are sensitive to real cross-file bleed.
// Hot (which schedules like isolate:false but DOES reset per file) must NOT fail
// them. The contrast is the proof.
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
