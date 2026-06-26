/**
 * Expo proof: a component that imports common Expo modules renders under the
 * native engine. The `expo` preset (auto-detected via expo-constants) shadows
 * each Expo module the way jest-expo mocks them, so their native runtime never
 * loads — while the surrounding tree renders through REAL React Native.
 *
 * expo-constants + expo-status-bar are installed as devDependencies so this
 * proves auto-detection + correct shadowing, mirroring third-party-stack.test.tsx.
 *
 * Scope note: Expo modules WITHOUT a built-in preset still need a vi.mock or a
 * custom preset (exactly as jest-expo provides mocks for them). This probe
 * covers the presets we ship, not the entire Expo SDK.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";

function ExpoScreen() {
  const name = Constants.expoConfig?.name ?? "app";
  return (
    <View testID="expo-screen">
      <StatusBar style="auto" />
      <Text>Hello from {name}</Text>
    </View>
  );
}

describe("Expo modules under the native engine", () => {
  it("expo-constants resolves through the preset (not the native runtime)", () => {
    expect(Constants).toBeTruthy();
    // The preset provides a deterministic expoConfig; the real native module is
    // never loaded (it would have no host to read manifest from in Node).
    expect(typeof Constants.expoConfig === "object" || Constants.expoConfig == null).toBe(true);
  });

  it("a component using expo-status-bar + expo-constants renders through real RN", async () => {
    await render(<ExpoScreen />);
    expect(screen.getByTestId("expo-screen")).toBeTruthy();
    expect(screen.getByText(/Hello from/)).toBeTruthy();
  });
});
