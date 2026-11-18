// jest.unmock of every root mock in this app, each for the copy the test file resolves:
// a nested copy keeps its root mock, now held by name only, with no registration by file
// left (#899).
jest.unmock("vn-esm-only-lib/cid");
jest.unmock("vn-esm-only-lib/hasher");
jest.unmock("vn-dual-lib/cid");

import { parse } from "vn-esm-only-consumer";
import { parse as nestedParse } from "vn-esm-only-nested-consumer";

it("loads the real module for the copy the test file resolves", () => {
  expect(parse("bafy").source).toBe("real");
});

it("keeps the root mock for a nested copy when no other mock is registered", () => {
  expect(nestedParse("bafy").source).toBe("mock");
});
