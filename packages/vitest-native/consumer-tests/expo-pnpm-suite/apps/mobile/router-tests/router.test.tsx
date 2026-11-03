import { renderRouter, screen, testRouter } from "expo-router/testing-library";
import { expect, test } from "vitest";

// The app/ routes through expo-router's own testing library. On Android, the Stack's
// toolbar loads expo-router's .xml vector drawables, which must resolve as assets.
test("renders the app/ routes and navigates with testRouter", async () => {
  await renderRouter("./app", { initialUrl: "/" });
  expect(screen.getByText("home screen")).toBeTruthy();
  expect(screen.getByTestId("avatar")).toBeTruthy();

  await testRouter.push("/details/42");
  expect(screen.getByText("details for 42")).toBeTruthy();
  expect(screen).toHavePathname("/details/42");

  await testRouter.back();
  expect(screen).toHavePathname("/");
});
