// The mocked file reached by the package's own relative import (its root module
// re-exports ./cid.js) and by name. Jest matches a root mock by request name, so the
// relative import is the real module and the import by name is the mock (#899).
import { CID as byName } from "vn-esm-only-consumer";
import { CID } from "vn-esm-only-consumer/via-root";

it("loads the real module for a package's own relative import of a root-mocked file", () => {
  expect(CID.parse("bafy").source).toBe("real");
});

it("serves the root mock to an import of the same file by name", () => {
  expect(byName.parse("bafy").source).toBe("mock");
});
