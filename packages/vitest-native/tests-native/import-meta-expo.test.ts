/**
 * `import.meta` in an Expo app's own source that Node loads. babel-preset-expo, through
 * the app's Babel config, replaces it with `globalThis.__ExpoImportMetaRegistry`, and the
 * engine's lowering leaves that alone (tests/import-meta-node-compile.test.ts). The
 * registry is installed by Expo's winter runtime, which the engine loads before any test
 * file runs (installExpoRuntime in src/native/globals.mjs), as jest-expo's setup file
 * does. Without it, the rewritten file would throw a TypeError that Jest does not.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

it("a file Node loads reads `import.meta.url` from Expo's registry", () => {
  const { status, output } = runApp("expo-import-meta-app", {
    from: path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/expo-import-meta-app"),
  });
  expect(status, output).toBe(0);
  expect(output).toMatch(/Tests\s+2 passed/);
}, 150_000);
