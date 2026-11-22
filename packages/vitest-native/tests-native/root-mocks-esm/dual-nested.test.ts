// vn-esm-only-dual-consumer has its own copy of vn-esm-only-lib, whose cid subpath is
// dual, while the root copy's is import-only. A root mock applies to every copy, through
// `import` and `require` alike (#898).
import { createRequire } from "node:module";
import { CID } from "vn-esm-only-dual-consumer";

it("serves the root mock to an import from a nested dual copy", () => {
  expect(CID.parse("bafy").source).toBe("mock");
});

it("serves the root mock to a require from a nested dual copy", () => {
  const { CID: required } = createRequire(import.meta.url)("vn-esm-only-dual-consumer/require");
  expect(required.parse("bafy").source).toBe("mock");
});
