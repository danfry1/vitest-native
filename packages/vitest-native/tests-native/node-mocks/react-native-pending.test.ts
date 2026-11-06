/**
 * A pending vi.doMock of a file inside React Native fails by name for React Native's own
 * require of it, through the precompiled registry's side channel as through
 * Module._load (R7, R9).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

it("names a pending vi.doMock of a React Native file", () => {
  vi.doMock("react-native/Libraries/Vibration/Vibration", () => ({ default: { vibrate() {} } }));
  expect(() => requireFrom("react-native").Vibration).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});
