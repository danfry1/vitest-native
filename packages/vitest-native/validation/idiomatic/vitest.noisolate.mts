// Negative control for the hand-written suite: native isolate:false, NO hot
// runtime, so there is no per-file reset. Used to demonstrate WHICH bleed probes
// are actually sensitive (fail here) vs which pass for other reasons (e.g. RNTL
// auto-cleanup handling them intra-file regardless of per-file reset).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

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
    include: [path.resolve(here, "*.test.tsx")],
  },
});
