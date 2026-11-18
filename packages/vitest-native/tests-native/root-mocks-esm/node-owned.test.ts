// Root mock: __mocks__/vn-esm-only-lib/cid.js. vn-esm-only-consumer is an installed
// ES-module package, which Node loads, and it imports vn-esm-only-lib/cid, a subpath
// `require` cannot resolve (#896).
import { parse } from "vn-esm-only-consumer";

it("serves the root mock to the import Node-owned code makes", () => {
  expect(parse("bafy").source).toBe("mock");
});
