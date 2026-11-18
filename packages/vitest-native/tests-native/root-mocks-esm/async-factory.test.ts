// A jest.mock factory the author wrote async, for a subpath only `import` resolves: an
// import from Node-owned code cannot wait for it, so it fails by name instead of loading
// an empty module (#896).
jest.mock("vn-esm-only-lib/cid", async () => ({
  CID: { parse: (text: string) => ({ text, source: "async" }) },
}));

it("fails an import from Node-owned code by name while the factory has not settled", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(import("vn-esm-only-consumer/for-async")).rejects.toMatchObject({
      code: "MOCK_NOT_SEEN_BY_NODE",
    });
  } finally {
    warn.mockRestore();
  }
});
