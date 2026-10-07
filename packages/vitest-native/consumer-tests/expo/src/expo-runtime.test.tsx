import { createRequire } from "node:module";
import { expect, test } from "vitest";

const loaded = () =>
  Object.keys(createRequire(import.meta.url).cache).filter((file) =>
    /[\\/]node_modules[\\/](expo-asset|expo-constants)[\\/]build[\\/]/.test(file),
  );

// `expo` publishes TypeScript, so the native loader compiles it and hands Node CommonJS
// with its source. Node runs that through the ESM translator, whose `require` resolves
// to a file URL before the loader sees it — so `expo` → `expo-asset` → `expo-constants`
// used to bypass the preset redirect and load the real packages, which crashed on
// feature-detected native modules. Its dev-server message socket also threw on import.
test("imports the expo package itself", async () => {
  const Expo = await import("expo");
  expect(typeof Expo.registerRootComponent).toBe("function");
});

test("packages expo requires internally are still the preset mocks", async () => {
  await import("expo");
  expect(loaded()).toEqual([]);
});
