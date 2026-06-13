import React from "react";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";

test("runs a packed Expo consumer with auto-detected presets", () => {
  render(
    <View testID="root">
      <StatusBar style="auto" />
      <Text>{Constants.expoConfig?.name}</Text>
    </View>,
  );

  expect(Constants.expoConfig?.name).toBe("test-app");
  expect(screen.getByTestId("root")).toHaveTextContent("test-app");
});
