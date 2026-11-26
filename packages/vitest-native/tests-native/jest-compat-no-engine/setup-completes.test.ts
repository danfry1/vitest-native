// Runs under tests-native/vitest.jest-compat-no-engine.config.mts: no reactNative(), so
// nothing compiles React Native for Node. The jest-compat setup must not load it.
import path from "node:path";

jest.mock("node:path", () => ({ ...jest.requireActual("node:path"), sep: "#" }));

test("the setup completes and the Jest API works", () => {
  const fn = jest.fn((n: number) => n + 1);
  expect(fn(1)).toBe(2);
  expect(fn).toHaveBeenCalledWith(1);
  expect(path.sep).toBe("#");
  expect(jest.requireActual<typeof path>("node:path").sep).not.toBe("#");
});
