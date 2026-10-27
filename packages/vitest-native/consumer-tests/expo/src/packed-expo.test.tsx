import React from "react";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";
import { metroWinner } from "./metro-winner";

test("renders a packed Expo consumer with the real expo-constants and expo-status-bar", async () => {
  await render(
    <View testID="root">
      <StatusBar style="auto" />
      <Text>{Constants.expoConfig?.name ?? "no config"}</Text>
    </View>,
  );

  // The package's own default export, not a preset's: no made-up app name.
  expect(Constants.expoConfig?.name).not.toBe("test-app");
  expect(screen.getByTestId("root")).toBeTruthy();
});

test("uses Expo Metro's TypeScript-first source extension precedence", () => {
  expect(metroWinner).toBe("typescript");
});

// Expo packages publish TypeScript source. SymbolView, which the SDK 57 template's
// Collapsible renders, reaches expo-modules-core's src/polyfill/index.ts: a bare
// `// noop` that Node parses fine but refuses to load from node_modules because of
// its extension.
test("renders an Expo module whose TypeScript source has no type syntax", async () => {
  await render(
    <View testID="symbol-host">
      <SymbolView name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }} />
    </View>,
  );
  expect(screen.getByTestId("symbol-host")).toBeTruthy();
});
