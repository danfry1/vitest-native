import { expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { LoginForm } from "./LoginForm.js";

test("enables submit only when valid and calls onSubmit", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  await render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByTestId("email"), "bad");
  expect(screen.getByText("Enter a valid email and a 6+ char password")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();

  await user.clear(screen.getByTestId("email"));
  await user.type(screen.getByTestId("email"), "a@b.com");
  await user.type(screen.getByTestId("password"), "secret1");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await user.press(screen.getByText("Sign in"));
  expect(onSubmit).toHaveBeenCalledWith("a@b.com");
});

test("password is masked", async () => {
  await render(<LoginForm />);
  expect(screen.getByTestId("password")).toHaveProp("secureTextEntry", true);
});
