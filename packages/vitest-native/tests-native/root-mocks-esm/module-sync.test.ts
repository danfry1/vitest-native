// The mocked subpath's `import` target is chosen under Node's `module-sync` condition, as
// Node's ESM loader chooses it, so the mock is keyed by the file the import loads (#896).
import { source } from "vn-esm-only-consumer/hasher";

it("serves the root mock where the import condition picks a module-sync target", () => {
  expect(source).toBe("mock");
});
