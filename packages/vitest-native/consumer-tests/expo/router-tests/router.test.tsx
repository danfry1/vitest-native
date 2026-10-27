import { renderRouter, screen, testRouter } from "expo-router/testing-library";
import { expect, test } from "vitest";
import React from "react";
import { Text } from "react-native";

// expo-router's OWN testing library, as its documentation shows — no wrapper, no
// re-installed timers, helpers called plainly. This is the code a jest-expo suite
// already contains; the point of the gate is that it ports verbatim. From SDK 58 the
// library is written for RNTL 14, where render and testRouter's navigation are async.

test("renders the app/ route tree and navigates with testRouter (file-based routes)", async () => {
  await renderRouter("./app", { initialUrl: "/" });
  expect(screen.getByText("home screen")).toBeTruthy();
  expect(screen).toHavePathname("/");

  await testRouter.push("/details/42");
  expect(screen.getByText("details for 42")).toBeTruthy();
  expect(screen).toHavePathname("/details/42");

  await testRouter.back();
  expect(screen).toHavePathname("/");
  expect(screen.getByText("home screen")).toBeTruthy();
});

test("discovers a file route root computed at runtime", async () => {
  // The discarded single-graph capsule prototype found literal renderRouter calls
  // with a source regex. Keep this deliberately non-literal so the production
  // Node-owned Router path proves it does not depend on that rewrite.
  const routeRoot = ["./", "app"].join("");
  await renderRouter(routeRoot, { initialUrl: "/details/17" });
  expect(screen.getByText("details for 17")).toBeTruthy();
  expect(screen).toHavePathname("/details/17");
});

test("renders an in-memory route context (the unit-test shape)", async () => {
  await renderRouter(
    {
      index: () => <Text>memory home</Text>,
      about: () => <Text>memory about</Text>,
    },
    { initialUrl: "/about" },
  );
  expect(screen.getByText("memory about")).toBeTruthy();
  expect(screen).toHavePathname("/about");
  await testRouter.replace("/");
  expect(screen.getByText("memory home")).toBeTruthy();
});

test("renders a route and finds it asynchronously (#296)", async () => {
  // The report's own test: on SDK 58 any expo import loaded react-native/setup-env,
  // which replaced Node's timers, so the awaited find never settled and the run hung.
  await renderRouter({ index: () => <Text>Home</Text> });
  expect(await screen.findByText("Home")).toBeOnTheScreen();
});
