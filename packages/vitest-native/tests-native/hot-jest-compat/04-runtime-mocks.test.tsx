import { expect, test } from "vitest";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// Runtime (non-hoisted) mocks: jest.doMock, jest.setMock and jest.dontMock apply to
// later imports in this file only.

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["runtime-mocked"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own runtime mocks apply", async () => {
  jest.doMock("./fixtures/runtime-mocked", () => ({ value: () => "mocked-by-doMock" }));
  expect((await import("./fixtures/runtime-mocked")).value()).toBe("mocked-by-doMock");
  jest.resetModules();
  jest.setMock("./fixtures/runtime-mocked", { value: () => "mocked-by-setMock" });
  expect((await import("./fixtures/runtime-mocked")).value()).toBe("mocked-by-setMock");
  jest.resetModules();
  jest.dontMock("./fixtures/runtime-mocked");
  expect((await import("./fixtures/runtime-mocked")).value()).toBe("real-runtime");
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything(["runtime-mocked"]);
});
