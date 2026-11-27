// Runs under tests-native/vitest.jest-compat-no-engine.config.mts: no reactNative(). The
// setup must not load React Native at all, not only avoid a load that throws: a load from
// a project where React Native happens to be compiled would pass setup-completes.test.ts.
import path from "node:path";

// Any installed copy, whichever root it resolves from.
const marker = `${path.sep}node_modules${path.sep}react-native${path.sep}`;
const underReactNative = (file: string) => file.includes(marker);

test("the check recognises a file under react-native", () => {
  expect(underReactNative(path.join("/x", "node_modules", "react-native", "index.js"))).toBe(true);
  expect(underReactNative(path.join("/x", "node_modules", "react-native-svg", "index.js"))).toBe(
    false,
  );
});

test("the setup loads no file under react-native", () => {
  const loaded = Object.keys(require.cache);
  // The setup itself loads through Node's require, so the cache is not empty.
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter(underReactNative)).toEqual([]);
});
