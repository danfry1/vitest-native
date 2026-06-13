import React from "react";
import { expect as jestExpect, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Platform, Text, View } from "react-native";
import { expect, test } from "vitest";
import { platformFile } from "./platform";

test("runs a packed bare React Native consumer", () => {
  render(
    <View testID="root">
      <Text>Packed bare consumer</Text>
    </View>,
  );

  expect(Platform.OS).toBe("ios");
  expect(platformFile).toBe("ios");
  expect(screen.getByTestId("root")).toHaveTextContent("Packed bare consumer");
});

test("loads Jest compatibility shims from the packed export map", () => {
  const fn = jest.fn();
  fn("packed");

  jestExpect(fn).toHaveBeenCalledWith("packed");
  expect(globalThis.jest).toBe(jest);
});
