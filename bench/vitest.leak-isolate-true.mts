// Native engine with GENUINE isolate:true — bypasses the reactNative() plugin
// (whose config() forces isolate:false and wins the Vite merge) by inlining the
// native engine config. This isolates the real variable: does true per-file
// isolation clean up both leakage classes?
import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
// dist/index.* -> dist/native/setup.mjs
const setupFile = path.join(path.dirname(require.resolve("vitest-native")), "native/setup.mjs");

export default defineConfig({
  resolve: {
    conditions: ["react-native"],
    extensions: [
      ".ios.tsx", ".ios.ts", ".ios.js",
      ".native.tsx", ".native.ts", ".native.js",
      ".tsx", ".ts", ".jsx", ".js",
    ],
    dedupe: ["react", "react-test-renderer", "react-is"],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["leak/*.test.tsx"],
    setupFiles: [setupFile],
    env: { VITEST_NATIVE_PROJECT_ROOT: import.meta.dirname },
    isolate: true,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    sequence: { shuffle: false },
    fileParallelism: false,
    server: { deps: { external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/] } },
  },
});
