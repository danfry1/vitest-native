/**
 * expo-image probes for expo-observe's native module with requireOptionalNativeModule
 * as it loads. The engine answered every native module name with a stub, so it found
 * one, called into it, and failed ("Cannot read properties of undefined (reading
 * 'expo-image')"). A module no installed package defines is absent now, as on a device.
 */
import { render, screen } from "@testing-library/react-native";
import { Image } from "expo-image";
import { expect, it } from "vitest";

it("renders an expo-image Image", async () => {
  await render(<Image source={{ uri: "https://example.test/a.png" }} testID="image" />);
  expect(screen.getByTestId("image")).toBeOnTheScreen();
});

it("reads a native module no installed package defines as absent", () => {
  const modules = (globalThis as { expo: { modules: Record<string, unknown> } }).expo.modules;
  expect(modules.ExpoObserve).toBeUndefined();
  expect(modules.ExpoImage).toBeDefined();
});
