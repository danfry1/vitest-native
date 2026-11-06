/**
 * A vi.mock of a file inside React Native reaches React Native's own require of it: the
 * precompiled registry requires its modules by id, past Module._load, and asks the mocks
 * first (`__vitest_native_node_mock_for`).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("react-native/Libraries/Utilities/PixelRatio", () => ({
  default: { get: () => 7, getFontScale: () => 1, roundToNearestPixel: (n: number) => n },
}));

it("is what React Native's own require of the file returns", async () => {
  await import("react-native/Libraries/Utilities/PixelRatio");
  expect(requireFrom("react-native").PixelRatio.get()).toBe(7);
});
