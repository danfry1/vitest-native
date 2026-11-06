describe("with setup", () => {
  beforeAll(() => {
    if (typeof vi !== "undefined") throw new Error("setup failed under Vitest");
  });
  it("needs the setup", () => {});
});
