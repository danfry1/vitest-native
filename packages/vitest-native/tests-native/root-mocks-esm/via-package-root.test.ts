// The mocked file reached first by the package's own relative import (its root module
// re-exports ./cid.js), with nothing importing vn-esm-only-lib/cid by name: a mock
// applies by file, whatever request reaches it (#896). Jest itself matches a root mock
// with no jest.mock call by name, so its relative import would be real; jestMockTransform
// registers each root mock with jest.mock, which this engine keys by file, as Jest keys
// an explicit jest.mock.
import { CID } from "vn-esm-only-consumer/via-root";

it("serves the root mock to a relative import of the mocked file", () => {
  expect(CID.parse("bafy").source).toBe("mock");
});
