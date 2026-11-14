// The app's setup file ran, after the engine's, and read React Native.
import { expect, test } from "vitest";

test("the app's setup file imported react-native", () => {
  expect((globalThis as { setupSawOS?: string }).setupSawOS).toBe("ios");
});
