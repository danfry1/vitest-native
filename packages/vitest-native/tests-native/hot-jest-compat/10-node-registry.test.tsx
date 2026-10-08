import { expect, test } from "vitest";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// A jest.mock that only Node's require() reads: jest-compat registers it in a per-file
// registry the loader hook consults. The next file must not see it.
jest.mock("./fixtures/node-registry-mocked", () => ({ value: () => "mocked-node-registry" }));

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["node-registry"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own mock reaches require()", () => {
  expect(require("./fixtures/node-registry-mocked").value()).toBe("mocked-node-registry");
  expect(jest.requireMock("./fixtures/node-registry-mocked")).toBe(
    require("./fixtures/node-registry-mocked"),
  );
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  // Leave an isolateModulesAsync block open as well: the next file must start outside it.
  void (
    jest as unknown as { isolateModulesAsync(fn: () => Promise<void>): Promise<void> }
  ).isolateModulesAsync(() => new Promise<void>(() => {}));
  await polluteEverything(["node-registry"]);
});
