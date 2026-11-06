// JSX in a project's own .js test, .js source and .js setup file (project-jsx.ts),
// under the engine and runtime the config's --mode names.
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { Greeting, stackHere } from "./greeting.js";

it("compiles JSX in the test file and in the .js source it imports", async () => {
  await render(<Greeting name="ada" />);
  expect(screen.getByText("Hello ada")).toBeTruthy();
});

it("compiles JSX in a .js setup file", async () => {
  await render(globalThis.__setupElement);
  expect(screen.getByTestId("from-setup")).toBeTruthy();
});

it("maps stack traces back to the original .js lines", () => {
  expect(stackHere()).toMatch(/greeting\.js:10:\d+/);
});
