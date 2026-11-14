// The app points `lib` at its source; `lib` peers on react-native, so the engine
// detects it and Node compiles it.
import "../../../support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../../../dist/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: { alias: [{ find: /^lib$/, replacement: `${root}/packages/lib/src/index.ts` }] },
  test: { name: "app", environment: "node" },
});
