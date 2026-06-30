import { expect, test } from "vitest";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { TodoList } from "./TodoList.js";

test("renders seed item and adds a new one", async () => {
  const user = userEvent.setup();
  await render(<TodoList />);
  expect(screen.getByText("Write tests")).toBeOnTheScreen();

  await user.type(screen.getByTestId("draft"), "Ship it");
  await user.press(screen.getByText("Add"));
  expect(screen.getByText("Ship it")).toBeOnTheScreen();
});

test("toggles a todo done", async () => {
  const user = userEvent.setup();
  await render(<TodoList />);
  await user.press(screen.getByText("Write tests"));
  expect(screen.getByTestId("todo-1")).toHaveTextContent("✓ Write tests");
});
