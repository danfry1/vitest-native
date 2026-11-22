// Holds the other worker, so the victim runs on the polluter's.
import { expect, test } from "vitest";
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

test("takes long enough to keep its worker busy", async () => {
  await render(<Text>filler</Text>);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(screen.getByText("filler")).toBeTruthy();
});
