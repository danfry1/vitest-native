import { expect, test } from "vitest";
import ReactNative from "react-native";

test("routes an arbitrary CommonJS require to the preserved actual", async () => {
  const consumer = await import("../single-graph/cjs-rn-consumer.cjs");
  const requiredReactNative = consumer.default ?? consumer;

  expect(requiredReactNative).toBe(ReactNative);
  expect(requiredReactNative.Platform.OS).toBe("ios");
});
