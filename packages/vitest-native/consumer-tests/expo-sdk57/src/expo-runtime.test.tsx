import { createRequire } from "node:module";
import { expect, test } from "vitest";

const loaded = () =>
  Object.keys(createRequire(import.meta.url).cache).filter((file) =>
    /[\\/]node_modules[\\/](expo-asset|expo-constants)[\\/](build|src)[\\/]/.test(file),
  );

// `expo` publishes TypeScript, so the native loader compiles it and hands Node CommonJS
// with its source. Its dev-server message socket also threw on import.
test("imports the expo package itself", async () => {
  const Expo = await import("expo");
  expect(typeof Expo.registerRootComponent).toBe("function");
});

// The native engine runs Expo packages as themselves, on native-module mocks, as
// jest-expo does: the expo preset applies to the mock engine (NATIVE_ENGINE_RUNS_PACKAGES
// in the plugin's preset-map).
test("packages expo requires internally load as themselves", async () => {
  await import("expo");
  expect(loaded().some((file) => /expo-constants/.test(file))).toBe(true);
  expect(loaded().some((file) => /expo-asset/.test(file))).toBe(true);
});
