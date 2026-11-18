// vn-dual-consumer reaches the root copy of vn-dual-lib, whose cid subpath is dual: an
// import loads its ES-module file and a require its CommonJS one. A root mock applies to
// both, as Jest matches a root mock by name (#898).
import { createRequire } from "node:module";
import { CID } from "vn-dual-consumer";

it("serves the root mock to an import of a dual subpath", () => {
  expect(CID.parse("bafy").source).toBe("mock");
});

it("serves the root mock to a require of a dual subpath", () => {
  const { CID: required } = createRequire(import.meta.url)("vn-dual-consumer/require");
  expect(required.parse("bafy").source).toBe("mock");
});
