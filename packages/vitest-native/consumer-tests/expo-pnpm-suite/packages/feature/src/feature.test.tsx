/**
 * A workspace package that runs a sibling library's setup file and reaches its source
 * through an alias. The library declares a react-native peer and publishes an exports
 * map without "./package.json", so it is detected as a React Native package; its setup
 * file and source must still load as this project's own files.
 */
import { Avatar } from "@suite/ui-src";
import { spacing } from "@suite/tokens";
import { render, screen } from "@testing-library/react-native";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

declare module "vitest" {
  interface Assertion<R extends void | Promise<void> = void, T = unknown> {
    toBeSuiteAvatar(): R;
  }
}

it("runs the sibling library's setup file once", () => {
  expect((globalThis as { __suiteUiSetup?: number }).__suiteUiSetup).toBe(1);
});

it("renders the library's expo-image Avatar through the alias", async () => {
  await render(<Avatar uri="https://example.test/b.png" />);
  expect(screen.getByTestId("avatar")).toBeSuiteAvatar();
});

it("reads an undeclared sibling's source through an alias", () => {
  expect(spacing).toBeGreaterThan(0);
});

it("does not resolve expo itself: the Avatar reached it through @suite/ui's expo-image", () => {
  const require = createRequire(import.meta.url);
  expect(() => require.resolve("expo")).toThrow();
  expect(() => require.resolve("expo-image")).toThrow();
});
