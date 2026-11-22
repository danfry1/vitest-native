// The setup file required the store through Node; this import evaluates it through Vite.
// The file now exists twice, which the ownership guard reports as evaluated by both,
// whichever spelling the project root was given in.
import { expect, it } from "vitest";
import { store } from "./src/store";

it("holds the store twice", () => {
  const viaNode = (globalThis as { viaNode?: { store: unknown } }).viaNode;
  expect(viaNode?.store).toBeDefined();
  expect(viaNode?.store).not.toBe(store);
});
