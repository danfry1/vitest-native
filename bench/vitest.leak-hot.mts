// Native engine with the HOT RUNTIME (custom pool + worker entry + surgical
// reset): the scheduler keeps ONE worker alive across files (RN loads once);
// the worker flips isolate back on so Vitest's per-file module-runner reset
// still runs (covers Class A); reset.mjs cleans the resident state Vitest
// can't reach (Classes B/C/D: RN listeners, globals, RN mutable state).
//
// THE GATE: all classes must pass with a single worker and fixed order — the
// adversarial case (no masking by parallelism). Scale check: `node leak/gen.mjs 50`.
// M1 result (2026-06-10): 20/20 @ 5 files, 200/200 @ 50 files, one worker.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: true, diagnostics: true })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: {
    globals: true,
    environment: "node",
    include: ["leak/*.test.tsx"],
    sequence: { shuffle: false },
    fileParallelism: false,
  },
});
