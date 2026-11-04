import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { add } from "lib";
it("adds", () => expect(add(1, 2)).toBe(3));
// The gate is about files Node compiles: if Vite loaded `lib`, it would prove nothing.
it("loads lib through Node", () => {
  const loaded = Object.keys(createRequire(import.meta.url).cache);
  expect(
    loaded.some((file) => file.replaceAll("\\", "/").endsWith("packages/lib/src/index.ts")),
  ).toBe(true);
});
