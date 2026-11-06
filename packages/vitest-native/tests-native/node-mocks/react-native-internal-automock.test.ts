/**
 * An automock of a file inside React Native: while Vitest builds it, its load of the
 * original comes back through Node's require of that file, which gets the real module,
 * not the half-built automock. Once built, React Native's own require gets the test's
 * automocked instance (R3).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("react-native/Libraries/Utilities/PixelRatio");

it("builds the automock, and serves it to React Native's own require", async () => {
  const mocked = (await import("react-native/Libraries/Utilities/PixelRatio")).default;
  expect(vi.isMockFunction(mocked.get)).toBe(true);
  expect(requireFrom("react-native").PixelRatio.get).toBe(mocked.get);
});
