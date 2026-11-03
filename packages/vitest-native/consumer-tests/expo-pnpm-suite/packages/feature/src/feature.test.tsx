/**
 * A workspace package that runs a sibling library's setup file and reaches its source
 * through an alias. The library declares a react-native peer and publishes an exports
 * map without "./package.json", so it stays the project's own source (Vite-owned); its
 * setup file and source must load as such. The library declares expo-image, so this
 * package's tests load expo-image, expo and expo-asset through it: those installed
 * packages must be compiled although this package declares none of them.
 *
 * Each half has failed in a release candidate. The setup file given to Node failed
 * with MODULE_OWNER_CONFLICT (fixed by #427). Those installed packages left uncompiled
 * failed at setup with `Cannot find module '…/expo-asset/build/Asset.fx'` (fixed by #433):
 * without #433, every leg of this package fails that way.
 */
import { Avatar } from "@suite/ui-src";
import { spacing } from "@suite/tokens";
import { render, screen } from "@testing-library/react-native";
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
