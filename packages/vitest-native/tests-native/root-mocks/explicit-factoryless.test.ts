// A test's own factory-less jest.mock(name), with the package's manual mock in a __mocks__
// folder Vitest's lookup does not search (other-root/): Jest gives it the manual mock, not
// an automock (#566 review).
import { source } from "vn-lib-plain-mock";

jest.mock("vn-lib-plain-mock");

test("a factory-less jest.mock gets the manual mock", () => {
  expect(source).toBe("mocked-from-other-root");
  expect(require("vn-lib-plain-mock").source).toBe("mocked-from-other-root");
});
