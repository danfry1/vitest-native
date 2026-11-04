// museum-counter is installed pnpm-style, in a store directory named after its peers
// (.pnpm/museum-counter@1.0.0_react@<v>_vitest@<v>/node_modules/museum-counter).
import { expect, test } from "vitest";
import { next } from "museum-counter";

test("an installed package is a fresh module in each test file", () => {
  expect(next(), "this file's museum-counter starts fresh").toBe(1);
});
