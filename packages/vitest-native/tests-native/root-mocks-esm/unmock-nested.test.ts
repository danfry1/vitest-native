// jest.unmock of a root-mocked subpath takes the mock off the copy the test file
// resolves; a nested copy keeps it, as Jest records the unmock for that module id only
// (#899).
jest.unmock("vn-esm-only-lib/cid");

import { parse } from "vn-esm-only-consumer";
import { parse as nestedParse } from "vn-esm-only-nested-consumer";

it("loads the real module for the copy the test file resolves", () => {
  expect(parse("bafy").source).toBe("real");
});

it("keeps the root mock for a nested copy", () => {
  expect(nestedParse("bafy").source).toBe("mock");
});
