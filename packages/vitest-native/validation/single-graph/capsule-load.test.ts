import { expect, test } from "vitest";

test("loads the React Native capsule", async () => {
  const reactNative = await import("react-native");

  expect(reactNative.default.Platform.OS).toBe("ios");
  expect(reactNative.default.View).toBeTruthy();
});

test("loads react-test-renderer beside the capsule", async () => {
  const renderer = await import("react-test-renderer");

  expect(renderer.create).toBeTypeOf("function");
});

test("loads RNTL beside the capsule", async () => {
  const testingLibrary = await import("@testing-library/react-native");

  expect(testingLibrary.render).toBeTypeOf("function");
});
