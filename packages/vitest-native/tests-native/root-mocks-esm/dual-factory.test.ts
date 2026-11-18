// A jest.mock factory for a dual subpath: an import from Node-owned code resolves its
// ES-module file and a require its CommonJS one, and Jest's one module id covers both.
// The root __mocks__ mock it replaces stays applied to another copy of the package, which
// Jest matches by name (#899). The factory loads project source with jest.requireActual,
// so jestMockTransform also gives it an async variant, which Node cannot wait for: Node's
// import must be served the synchronous one.
jest.mock("vn-dual-lib/cid", () => {
  const { source } = jest.requireActual("./support/source");
  return { CID: { parse: (text: string) => ({ text, source }) } };
});

import { createRequire } from "node:module";
import { CID } from "vn-dual-consumer";
import { CID as nestedCID } from "vn-dual-nested-consumer";

it("serves the factory to an import of a dual subpath from Node-owned code", () => {
  expect(CID.parse("bafy").source).toBe("factory");
});

it("serves the factory to a require of a dual subpath from Node-owned code", () => {
  const { CID: required } = createRequire(import.meta.url)("vn-dual-consumer/require");
  expect(required.parse("bafy").source).toBe("factory");
});

it("keeps the root mock for another copy of the package", () => {
  expect(nestedCID.parse("bafy").source).toBe("mock");
});
