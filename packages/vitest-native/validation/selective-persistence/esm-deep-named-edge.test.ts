import { expect, test } from "vitest";
import ReactNative from "react-native";
import { findNodeHandle } from "react-native/Libraries/ReactNative/RendererProxy";
import { __vitestNativeRequire } from "virtual:vitest-native-single-graph-rn-capsule";

test("generates named deep exports without creating a second module", () => {
  const deep = __vitestNativeRequire("react-native/Libraries/ReactNative/RendererProxy");
  expect(deep.findNodeHandle).toBe(ReactNative.findNodeHandle);
  expect(findNodeHandle).toBe(deep.findNodeHandle);
});
