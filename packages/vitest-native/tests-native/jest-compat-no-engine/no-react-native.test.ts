// Runs under tests-native/vitest.jest-compat-no-engine.config.mts: no reactNative(). The
// setup must not load React Native at all, not only avoid a load that throws: a load from
// a project where React Native happens to be compiled would pass setup-completes.test.ts.
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
// Real-path spelling, as Node keys require.cache.
const reactNativeDir = realpathSync(path.dirname(require.resolve("react-native/package.json")));
const underReactNative = (file: string) => file.startsWith(reactNativeDir + path.sep);

test("the check recognises a file under react-native", () => {
  expect(underReactNative(path.join(reactNativeDir, "index.js"))).toBe(true);
  expect(underReactNative(`${reactNativeDir}-other${path.sep}index.js`)).toBe(false);
});

test("the setup loads no file under react-native", () => {
  const loaded = Object.keys(require.cache);
  // The setup itself loads through Node's require, so the cache is not empty.
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter(underReactNative)).toEqual([]);
});
