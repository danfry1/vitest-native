/**
 * The app `create-expo-app --template blank-typescript@sdk-58` creates, with only
 * vitest-native, Vitest and RNTL added. From SDK 56 babel-preset-expo no longer
 * depends on @react-native/babel-preset, so such a project has no React Native preset
 * installed; the native engine used to need one and ran the mock engine instead,
 * where Expo modules could not load. It compiles with Expo's preset now, as Metro does.
 */
import { createRequire } from "node:module";
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import App from "../App";

const require = createRequire(import.meta.url);

it("is the project shape this fixture exists for: no React Native preset installed", () => {
  // If a dependency starts pulling the preset in, this fixture stops testing the
  // Expo-preset path: pin the culprit out rather than deleting this check.
  expect(() => require.resolve("@react-native/babel-preset")).toThrow();
});

it("runs real React Native", () => {
  expect(
    (globalThis as { __vitest_native_control?: { engine: string } }).__vitest_native_control
      ?.engine,
  ).toBe("native");
});

it("renders the template's App", async () => {
  await render(<App />);
  expect(screen.getByText("Open up App.tsx to start working on your app!")).toBeOnTheScreen();
});

it("loads Expo itself", async () => {
  const Expo = await import("expo");
  expect(typeof Expo.registerRootComponent).toBe("function");
});
