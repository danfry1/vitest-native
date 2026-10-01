import { expect, test, vi } from "vitest";
import { compute } from "./fixtures/automocked";
import { source } from "./fixtures/dir-mocked";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// Factory-less jest.mock: one module has an adjacent __mocks__ file, the other is
// automocked by Vitest.
jest.mock("./fixtures/dir-mocked");
jest.mock("./fixtures/automocked");

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["dir-mocked", "automocked"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own mocks apply", () => {
  expect(source()).toBe("mocked-by-__mocks__");
  expect(vi.isMockFunction(compute)).toBe(true);
  expect(compute()).toBe(undefined);
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything(["dir-mocked", "automocked"]);
});
