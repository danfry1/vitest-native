import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react-native";
import * as React from "react";
import { Navigator } from "./app/Navigator.js";
import { AppProviders } from "./app/providers.js";
import { ListScreen } from "./app/screens.js";

test("async list shows a loading state, then the data", async () => {
  await render(
    <AppProviders>
      <Navigator initial="List" screens={{ List: () => <ListScreen /> }} />
    </AppProviders>,
  );
  expect(screen.getByTestId("loading")).toBeOnTheScreen();
  expect(await screen.findByText("Alpha")).toBeOnTheScreen();
  expect(screen.queryByTestId("loading")).toBeNull();
});

test("async list shows an error state on failure", async () => {
  await render(
    <AppProviders>
      <Navigator initial="List" screens={{ List: () => <ListScreen fail /> }} />
    </AppProviders>,
  );
  expect(await screen.findByTestId("error")).toHaveTextContent("Failed to load");
});
