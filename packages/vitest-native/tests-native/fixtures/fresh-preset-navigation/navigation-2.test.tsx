// One of two identical files: navigation hooks that need the rendering React, inside the
// navigation preset's container.
import React from "react";
import { Text } from "react-native";
import {
  NavigationContainer,
  ThemeProvider,
  useFocusEffect,
  useTheme,
} from "@react-navigation/native";
import { render, screen } from "@testing-library/react-native";

const theme = { dark: true, colors: { primary: "provided-primary" } } as never;

function Themed() {
  const { colors } = useTheme();
  return <Text>primary {String(colors.primary)}</Text>;
}

function Focused() {
  useFocusEffect(() => {});
  return <Text>focus effect ran</Text>;
}

test("useTheme reads the theme its provider gives", async () => {
  await render(
    <NavigationContainer>
      <ThemeProvider value={theme}>
        <Themed />
      </ThemeProvider>
    </NavigationContainer>,
  );
  expect(screen.getByText("primary provided-primary")).toBeTruthy();
});

test("useFocusEffect runs inside a render", async () => {
  await render(
    <NavigationContainer>
      <Focused />
    </NavigationContainer>,
  );
  expect(screen.getByText("focus effect ran")).toBeTruthy();
});
