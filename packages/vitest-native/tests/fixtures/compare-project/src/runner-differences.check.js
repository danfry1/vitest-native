// Each test here behaves differently under the two runners on purpose.
const underVitest = typeof vi !== "undefined";

describe("globals", () => {
  it("uses the jest global", () => {
    expect(typeof jest).toBe("object");
  });
  it("uses the vi global", () => {
    expect(typeof vi).toBe("object");
  });
});

(underVitest ? it.skip : it)("is skipped under Vitest only", () => {});

// In blocks of their own, so they are not matched by position with each other.
if (underVitest) describe("vitest block", () => it("exists under Vitest only", () => {}));
else describe("jest block", () => it("exists under Jest only", () => {}));
