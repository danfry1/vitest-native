import { expect, test } from "vitest";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { Counter } from "./Counter.js";

test("increments on press", async () => {
  const user = userEvent.setup();
  await render(<Counter />);
  expect(screen.getByTestId("count")).toHaveTextContent("Count: 0");
  await user.press(screen.getByText("Increment"));
  await user.press(screen.getByText("Increment"));
  expect(screen.getByTestId("count")).toHaveTextContent("Count: 2");
});

test("reset returns to start", async () => {
  const user = userEvent.setup();
  await render(<Counter start={5} />);
  await user.press(screen.getByText("Increment"));
  expect(screen.getByTestId("count")).toHaveTextContent("Count: 6");
  await user.press(screen.getByText("Reset"));
  expect(screen.getByTestId("count")).toHaveTextContent("Count: 5");
});
