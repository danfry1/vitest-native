describe("math", () => {
  it("adds", () => {
    expect(1 + 1).toBe(2);
  });
  describe("nested", () => {
    it("multiplies", () => {
      expect(2 * 3).toBe(6);
    });
  });
  it("repeats a title", () => {
    expect(true).toBe(true);
  });
  it("repeats a title", () => {
    expect(false).toBe(false);
  });
});

it("fails under both runners", () => {
  expect(1).toBe(2);
});

it.skip("is skipped under both runners", () => {});
