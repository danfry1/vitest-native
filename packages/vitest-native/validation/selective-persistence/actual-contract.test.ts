import { expect, test } from "vitest";
import ReactNative, { Platform } from "react-native";

test("restores the unmocked preserved actual in another file", () => {
  expect(Platform.OS).toBe("ios");
  expect(ReactNative).toBe((globalThis as any).__vitest_native_selective_persistence_rn__);
});
