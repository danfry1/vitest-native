// An installed React Native library with react-native-worklets as a peer. pnpm names its
// store directory after that peer (`.pnpm/axis-peer-lib@1.0.0_react-native-worklets@…`),
// and worklets' Jest resolver decides by substring whether a directory is its own, so
// the engine dropped `.native` for the library's files: expo-modules-core loaded its web
// adapter and expo-router's native-stack threw (#349). Hoisted installs never show it.
import { expect, test } from "vitest";
import { platform } from "axis-peer-lib";

test("a library beside worklets in the store resolves its .native file", () => {
  expect(platform).toBe("native");
});
