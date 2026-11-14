import React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import { test } from "vitest";

test("leaves an async act() scope open past its end", async () => {
  await render(<Text>first</Text>);
  void act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
});
