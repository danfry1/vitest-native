// Jest's root __mocks__ for node_modules packages apply with no jest.mock() call.
import React from "react";
import path from "node:path";
import { render, screen } from "@testing-library/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { source } from "vn-lib-plain-mock";
import { count } from "resident-singleton";
import { Greeting } from "./app/Greeting";

test("an app module's import of a React Native package gets the root mock", async () => {
  await render(<Greeting name="Ada" />);
  expect(screen.getByTestId("banner")).toHaveTextContent("mocked Ada");
});

test("a plain package gets the root mock", () => {
  expect(count()).toBe(-1);
});

test("the setup file got the mock too", () => {
  expect((globalThis as Record<string, unknown>).__setupCount).toBe(-1);
});

test("a mock in a second root applies", () => {
  expect(source).toBe("mocked-from-other-root");
});

test("a Node core module is not mocked without jest.mock()", () => {
  expect(path.join("a", "b")).toBe(`a${path.sep}b`);
});

test("a package a preset stands in for keeps the preset", async () => {
  let top: number | undefined;
  function Probe() {
    top = useSafeAreaInsets().top;
    return null;
  }
  await render(<Probe />);
  expect(top).toBeTypeOf("number");
  expect(top).not.toBe(-1);
});
