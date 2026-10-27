// Jest's snapshot is recorded in __snapshots__/; Vitest's in __vitest_snapshots__/.
describe("card", () => {
  it("renders", () => {
    expect({ title: "hello" }).toMatchSnapshot();
  });
});
