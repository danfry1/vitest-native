// A require of the mocked subpath, which Node cannot resolve itself, is still served the
// root mock: jest.requireMock loads it through Node's require (#896).
it("serves the root mock to jest.requireMock of the subpath", () => {
  const { CID } = jest.requireMock<typeof import("vn-esm-only-lib/cid")>("vn-esm-only-lib/cid");
  expect(CID.parse("bafy").source).toBe("mock");
});
