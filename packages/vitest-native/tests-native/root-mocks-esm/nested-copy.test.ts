// vn-esm-only-nested-consumer imports vn-esm-only-lib/cid from its own nested copy of the
// package, a different file from the root copy's. Jest matches a root mock by name, so
// every copy is mocked (#898).
import { CID } from "vn-esm-only-lib/cid";
import { CID as nestedCID, parse } from "vn-esm-only-nested-consumer";

it("serves the root mock to an import from a nested copy of the package", () => {
  expect(parse("bafy").source).toBe("mock");
  expect(nestedCID).toBe(CID);
});
