import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Platform, Text, View } from "react-native";
import { expect, test } from "vitest";
import { platformFile } from "./platform";

test("runs a packed current React Native consumer on Android", () => {
  render(
    <View testID="root">
      <Text>Packed React Native 0.86 consumer</Text>
    </View>,
  );

  expect(Platform.OS).toBe("android");
  expect(platformFile).toBe("android");
  expect(screen.getByTestId("root")).toHaveTextContent("Packed React Native 0.86 consumer");
});
