import { createRequire } from "node:module";
import path from "node:path";
import { underNativeEngine, workerRoot } from "./library-mock.js";

/**
 * The React Native the test runs against, for a preset that hands out its objects
 * (an `Animated.Value`, a `StyleSheet` result): the mock engine's mock, or real React
 * Native under the native engine, required from the project as the project's code
 * requires it. Read when the preset's code runs rather than when its module is built,
 * so it is the one the current test file loaded, and Node's require cache keeps the
 * lookup cheap.
 */
export function activeReactNative(): Record<string, any> {
  if (!underNativeEngine()) {
    const mock = (globalThis as { __vitest_native_mock?: Record<string, any> })
      .__vitest_native_mock;
    if (mock) return mock;
  }
  return createRequire(path.join(workerRoot(), "package.json"))("react-native");
}
