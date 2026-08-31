import { expect, test } from "vitest";
import ReactNative from "react-native";

test("routes an arbitrary CommonJS deep require to the capsule module identity", async () => {
  const consumer = await import("./deep-rn-consumer.cjs");
  const values = consumer.default ?? consumer;

  expect(values.root).toBe(ReactNative);
  expect(values.platform).toBe(ReactNative.Platform);
});
