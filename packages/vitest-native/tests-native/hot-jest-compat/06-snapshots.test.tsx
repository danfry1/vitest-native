import { expect, test } from "vitest";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// Snapshot state is per file: a reused worker must not carry one file's snapshot
// counters, names or obsolete entries into the next. 06 and 07 match the same test
// names against their own committed snapshot files.

test("every surface is clean", () => {
  expectCleanExcept([]);
});

test("matches its own snapshots", () => {
  expect({ file: "06", value: [1, 2, 3] }).toMatchSnapshot();
  expect({ file: "06", second: true }).toMatchSnapshot();
  expect("06").toMatchInlineSnapshot(`"06"`);
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything([]);
});
