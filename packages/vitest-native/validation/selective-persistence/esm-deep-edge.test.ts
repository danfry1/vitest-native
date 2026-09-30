import { expect, test } from "vitest";
import ReactNative from "react-native";
import PlatformModule from "react-native/Libraries/Utilities/Platform";

test("routes an ESM deep import to the capsule module identity", () => {
  const platform = (PlatformModule as any).default ?? PlatformModule;
  expect(platform).toBe(ReactNative.Platform);
});
