import { test } from "vitest";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// Mocks nothing, so it checks every surface — including the Node-owned package
// the previous file mocked, which no other file runs after.

test("every surface is clean", () => {
  expectCleanExcept([]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("pollutes every jest-compat surface and does not clean up", () => {
  polluteEverything([]);
});
