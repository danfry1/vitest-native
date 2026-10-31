import React from "react";
import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

test("a test that forgets to await an async act", async () => {
  await render(<Text>first file</Text>);
  expect(screen.getByText("first file")).toBeTruthy();
  // The bug in THIS file: the act scope is still open when the file ends.
  void act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
});
