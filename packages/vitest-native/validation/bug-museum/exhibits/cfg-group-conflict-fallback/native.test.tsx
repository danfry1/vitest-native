// The native project.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

test("renders under the native project", async () => {
  await render(<Text>native</Text>);
  expect(screen.getByText("native")).toBeTruthy();
});
