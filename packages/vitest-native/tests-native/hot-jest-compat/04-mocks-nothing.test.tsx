import { expect, test } from "vitest";
import { expectCleanExcept, filesSeenByThisWorker, polluteEverything } from "./surfaces";

// Mocks nothing, so it checks every surface — including the Node-owned package
// the previous file mocked, which no other file runs after.

test("ran in the worker the mode asks for", () => {
  // Without this the hot run could pass vacuously, one fresh worker per file.
  const expected = process.env.VN_HOT_JEST_COMPAT_MODE === "hot" ? 4 : 1;
  expect(filesSeenByThisWorker()).toBe(expected);
});

test("every surface is clean", () => {
  expectCleanExcept([]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("pollutes every jest-compat surface and does not clean up", () => {
  polluteEverything([]);
});
