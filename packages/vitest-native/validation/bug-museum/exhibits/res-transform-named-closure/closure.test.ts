// museum-flash (react-native-flash-message's shape) depends on museum-screen-helper
// (react-native-iphone-screen-helper's): an ES module that imports from react-native.
import { Platform } from "react-native";
import { expect, test } from "vitest";
import { platformOS } from "museum-flash";

test("the dependency of a package named in transform is compiled", () => {
  expect(platformOS(), "museum-screen-helper's Platform.OS").toBe(Platform.OS);
});
