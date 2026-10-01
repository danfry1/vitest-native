import { expect, test } from "vitest";
import { readSetting } from "../fixtures/settings-store";
import { expectCleanExcept, polluteEverything } from "./surfaces";

// Partial mock through requireActual, the shape a migrated suite reaches for.
jest.mock("../fixtures/settings-store", () => ({
  ...jest.requireActual("../fixtures/settings-store"),
  readSetting: () => "mocked-setting",
}));

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["settings"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own mock applies", () => {
  expect(readSetting()).toBe("mocked-setting");
});

test("pollutes every jest-compat surface and does not clean up", async () => {
  await polluteEverything(["settings"]);
});
