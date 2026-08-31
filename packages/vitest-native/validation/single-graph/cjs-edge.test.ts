import { expect, test } from "vitest";

// A CommonJS dependency that is not explicitly prebundled still executes a real
// Node require. That request cannot re-enter Vitest's virtual-module resolver, so
// it reaches RN's Flow source instead of the capsule.
test.fails("routes an arbitrary CommonJS RN edge back through Vitest", async () => {
  const consumer = await import("./cjs-rn-consumer.cjs");
  const reactNative = consumer.default ?? consumer;

  expect(reactNative.Platform.OS).toBe("ios");
});
