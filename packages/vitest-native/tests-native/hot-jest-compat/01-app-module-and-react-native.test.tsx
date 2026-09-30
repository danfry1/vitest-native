import { Platform } from "react-native";
import { expect, test } from "vitest";
import { greet } from "../fixtures/greeter";
import { expectCleanExcept, polluteEverything } from "./surfaces";

jest.mock("../fixtures/greeter", () => ({ greet: () => "mocked-hello" }));
// The clone-and-override pattern Jest-era suites use for React Native.
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  RN.Platform = { ...RN.Platform, OS: "android", select: (o: any) => o.android };
  return RN;
});

test("every surface this file did not mock is clean", () => {
  expectCleanExcept(["greeter", "react-native"]);
});

test("the default test timeout applies", async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test("this file's own mocks apply", () => {
  expect(greet()).toBe("mocked-hello");
  expect(Platform.OS).toBe("android");
});

test("pollutes every jest-compat surface and does not clean up", () => {
  polluteEverything(["greeter", "react-native"]);
});
