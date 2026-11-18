// The test's own import of the mocked subpath, made before the Node-owned consumer's, is
// the same module instance that consumer is served (#896).
import { CID } from "vn-esm-only-lib/cid";
import { CID as consumerCID, parse } from "vn-esm-only-consumer";

it("gives the test and Node-owned code one instance of the root mock", () => {
  expect(CID.parse("bafy").source).toBe("mock");
  expect(parse("bafy").source).toBe("mock");
  expect(consumerCID).toBe(CID);
});
