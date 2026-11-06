// RNTL's dont-cleanup-after-each opt-out in every file a hot worker runs (#527). Run with
// one worker and with two (package.json test:native:hot:rntl-optout); no test globals, so
// the engine's own afterEach cleanup is the one under test.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    environment: "node",
    include: ["tests-native/hot-rntl-optout/*.test.tsx"],
    sequence: { shuffle: false },
  },
});
