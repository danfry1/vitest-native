/**
 * The library's own suite, run from inside it. The library declares only expo-image, so
 * every Expo package expo-image reaches comes from its dependencies, not the app's.
 */
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { Avatar } from "./index";

it("renders an expo-image Image", async () => {
  await render(<Avatar uri="https://example.test/a.png" />);
  expect(screen.getByTestId("avatar")).toBeOnTheScreen();
});
