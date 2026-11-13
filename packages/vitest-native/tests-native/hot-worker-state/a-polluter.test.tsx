// The first file on its worker opts out of RNTL's auto-cleanup, as a file may (#534).
// That choice is this file's: it must not reach the files after it (#690).
import "@testing-library/react-native/dont-cleanup-after-each";
import { expect, test } from "vitest";
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

test("renders without auto-cleanup", async () => {
  await render(<Text>polluter</Text>);
  expect(screen.getByText("polluter")).toBeTruthy();
});
