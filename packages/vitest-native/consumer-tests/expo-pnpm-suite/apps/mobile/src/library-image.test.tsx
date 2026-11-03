/**
 * A workspace library that declares only expo-image, rendered by the app. Under pnpm's
 * isolated layout the app cannot resolve expo-image itself, and Expo packages that only
 * expo-image's own dependencies reach (expo-asset, expo-constants) must still be compiled.
 */
import { Avatar } from "@suite/ui";
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";

it("renders the library's expo-image Avatar", async () => {
  await render(<Avatar uri="https://example.test/me.png" />);
  expect(screen.getByTestId("avatar")).toBeOnTheScreen();
});
