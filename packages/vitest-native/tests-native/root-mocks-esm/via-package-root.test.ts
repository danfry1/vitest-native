// The mocked file reached only by the package's own relative import (its root module
// re-exports ./cid.js), with nothing importing vn-esm-only-lib/cid by name. Jest matches
// a root mock by request name, so that relative import is the real module (#899).
import { CID } from "vn-esm-only-consumer/via-root";

it("loads the real module for a package's own relative import of a root-mocked file", () => {
  expect(CID.parse("bafy").source).toBe("real");
});
