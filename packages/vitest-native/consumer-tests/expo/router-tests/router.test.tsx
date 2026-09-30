import { renderRouter, screen, testRouter } from "expo-router/testing-library";
import { expect, test } from "vitest";
import React from "react";
import { Text } from "react-native";

// expo-router's OWN testing library, as its documentation shows — no wrapper, no
// re-installed timers, helpers called plainly. This is the code a jest-expo suite
// already contains; the point of the gate is that it ports verbatim.

test("renders the app/ route tree and navigates with testRouter (file-based routes)", () => {
  renderRouter("./app", { initialUrl: "/" });
  expect(screen.getByText("home screen")).toBeTruthy();
  expect(screen).toHavePathname("/");

  testRouter.push("/details/42");
  expect(screen.getByText("details for 42")).toBeTruthy();
  expect(screen).toHavePathname("/details/42");

  testRouter.back();
  expect(screen).toHavePathname("/");
  expect(screen.getByText("home screen")).toBeTruthy();
});

test("renders an in-memory route context (the unit-test shape)", () => {
  renderRouter(
    {
      index: () => <Text>memory home</Text>,
      about: () => <Text>memory about</Text>,
    },
    { initialUrl: "/about" },
  );
  expect(screen.getByText("memory about")).toBeTruthy();
  expect(screen).toHavePathname("/about");
  testRouter.replace("/");
  expect(screen.getByText("memory home")).toBeTruthy();
});
