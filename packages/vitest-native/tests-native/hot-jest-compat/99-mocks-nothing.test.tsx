import fs from "node:fs";
import { expect, test } from "vitest";
import { expectCleanExcept, filesSeenByThisWorker, polluteEverything } from "./surfaces";

// Mocks nothing, so it checks every surface — including the Node-owned package
// the previous file mocked, which no other file runs after.

test("ran in the worker the mode asks for", () => {
  // Without this the hot run could pass vacuously, one fresh worker per file. It
  // expects the whole directory, so a filtered run of this file alone fails here by
  // design: run it through `test:native:hot:isolation`.
  const files = fs
    .readdirSync(new URL(".", import.meta.url))
    .filter((name) => name.endsWith(".test.tsx")).length;
  const expected = process.env.VN_HOT_JEST_COMPAT_MODE === "hot" ? files : 1;
  expect(filesSeenByThisWorker()).toBe(expected);
});

test("every surface is clean", () => {
  expectCleanExcept([]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything([]);
});
