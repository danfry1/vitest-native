import { expect, test } from "vitest";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as React from "react";
import { Navigator } from "./app/Navigator.js";
import { AppProviders } from "./app/providers.js";
import { DetailScreen, ListScreen, LoginScreen } from "./app/screens.js";

const screens = { Login: LoginScreen, List: ListScreen, Detail: DetailScreen };

test("full flow: login -> async list -> detail -> back", async () => {
  const user = userEvent.setup();
  await render(
    <AppProviders>
      <Navigator initial="Login" screens={screens} />
    </AppProviders>,
  );

  // Login screen
  expect(screen.getByText("Login")).toBeOnTheScreen();
  await user.type(screen.getByTestId("name"), "Dana");
  await user.press(screen.getByText("Continue"));

  // List screen loads asynchronously, then shows the user + items
  expect(await screen.findByText("Welcome Dana")).toBeOnTheScreen();
  expect(screen.getByText("Beta")).toBeOnTheScreen();

  // Navigate to detail with params
  await user.press(screen.getByText("Beta"));
  expect(screen.getByText("Detail: Beta")).toBeOnTheScreen();

  // Back returns to the list, which re-mounts and re-fetches (loading -> data)
  await user.press(screen.getByText("Back"));
  expect(await screen.findByText("Welcome Dana")).toBeOnTheScreen();
});
