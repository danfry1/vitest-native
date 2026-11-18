// vn-dual-nested-consumer has its own import-only copy of vn-dual-lib, while the root
// copy's cid subpath is dual. A root mock applies to every copy (#898).
import { CID } from "vn-dual-nested-consumer";

it("serves the root mock to an import-only nested copy of a dual package", () => {
  expect(CID.parse("bafy").source).toBe("mock");
});
