/**
 * Negative-control config for the ownership boundary.
 *
 * `server.deps.inline: true` takes precedence over the native engine's external
 * patterns. The singleton gate then imports the same detected RN package through
 * Vite and Node require, exposing whether the override creates two live stores.
 * The initial experiment reached the singleton assertion and failed it. Production
 * now rejects this config before collection with INLINE_BREAKS_OWNERSHIP; see
 * README for the mutation result that justified the guard.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: packageRoot,
  plugins: [reactNative({ engine: "native", diagnostics: true })],
  test: {
    include: ["tests-native/ecosystem-ownership.test.tsx"],
    maxWorkers: 1,
    server: { deps: { inline: true } },
  },
});
