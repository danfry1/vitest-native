import React from "react";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";
import { metroWinner } from "./metro-winner";

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

test("uses Expo Metro's TypeScript-first source extension precedence", () => {
  expect(metroWinner).toBe("typescript");
});

// Expo packages publish TypeScript source. SymbolView, which the SDK 57 template's
// Collapsible renders, reaches expo-modules-core's src/polyfill/index.ts: a bare
// `// noop` that Node parses fine but refuses to load from node_modules because of
// its extension.
test("renders an Expo module whose TypeScript source has no type syntax", () => {
  render(
    <View testID="symbol-host">
      <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }} />
    </View>,
  );
  expect(screen.getByTestId("symbol-host")).toBeTruthy();
});
