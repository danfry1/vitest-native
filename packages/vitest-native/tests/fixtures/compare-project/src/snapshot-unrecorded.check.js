// Jest has a snapshot for this test; Vitest has none recorded.
describe("badge", () => {
  it("renders", () => {
    expect({ label: "new" }).toMatchSnapshot();
  });
});
