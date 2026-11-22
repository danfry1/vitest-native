// A jest.mock factory that requires project source the test has not imported yet, as
// Bluesky's session provider tests do.
import { read } from "./src/api";
import { store } from "./src/store";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("./src/api", () => {
  const { store: required } = require("./src/store");
  return { read: () => required.value };
});

test("the factory's require is the store the test imports", () => {
  store.value = "set by the test";
  expect(read(), "the mock reads the test's store").toBe("set by the test");
});
