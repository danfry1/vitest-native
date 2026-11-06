import React from "react";
import { Platform, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

test("__mocks__/react-native.js applies, over the real module", async () => {
  expect(Platform.OS).toBe("android");
  expect(Platform.select({ ios: "i", android: "a" })).toBe("a");
  await render(<Text>still real</Text>);
  expect(screen.getByText("still real")).toBeTruthy();
});
