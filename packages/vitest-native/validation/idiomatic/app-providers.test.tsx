import { expect, test } from "vitest";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { Text, View } from "react-native";
import { AppProviders, useAuth, useSettings, useTheme } from "./app/providers.js";

function DeepConsumer() {
  const { user, login } = useAuth();
  const { theme, toggle } = useTheme();
  const { analytics } = useSettings();
  return (
    <View>
      <Text testID="user">{user ?? "anon"}</Text>
      <Text testID="theme">{theme}</Text>
      <Text testID="analytics">{String(analytics)}</Text>
      <Text accessibilityRole="button" onPress={() => login("Sam")}>
        do-login
      </Text>
      <Text accessibilityRole="button" onPress={toggle}>
        do-toggle
      </Text>
    </View>
  );
}

test("nested providers are all readable deep in the tree and update reactively", async () => {
  const user = userEvent.setup();
  await render(
    <AppProviders>
      <View>
        <DeepConsumer />
      </View>
    </AppProviders>,
  );
  expect(screen.getByTestId("user")).toHaveTextContent("anon");
  expect(screen.getByTestId("theme")).toHaveTextContent("light");
  expect(screen.getByTestId("analytics")).toHaveTextContent("true");

  await user.press(screen.getByText("do-login"));
  expect(screen.getByTestId("user")).toHaveTextContent("Sam");
  await user.press(screen.getByText("do-toggle"));
  expect(screen.getByTestId("theme")).toHaveTextContent("dark");
});
