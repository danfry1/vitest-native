import { expect, test } from "vitest";
import { read } from "rn-singleton-lib";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// A Node-owned ecosystem package (untranspiled, module-level state).
jest.mock("rn-singleton-lib", () => ({
  read: () => "mocked-lib",
  configure: () => {},
  markLoader: () => "mocked",
}));

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["lib"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own mock applies", () => {
  expect(read()).toBe("mocked-lib");
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything(["lib"]);
});
