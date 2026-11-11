// One of two identical files in one hot worker with freshRuntime. As Rocket.Chat's
// SplitNavigator.test.tsx does, the file opts out of the navigation preset with
// jest.requireActual, so Node require()s the package's ES build.
import React from "react";
import { Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { render, screen } from "@testing-library/react-native";

jest.mock("@react-navigation/native", () => jest.requireActual("@react-navigation/native"));

it("renders the real NavigationContainer in file b", async () => {
  await render(
    <NavigationContainer>
      <Text>in b</Text>
    </NavigationContainer>,
  );
  expect(screen.getByText("in b")).toBeTruthy();
});
