// A .tsx test importing project .js source that uses JSX (#561).
import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { Greeting } from "./greeting.js";

it("compiles JSX in a .js source file a .tsx test imports", async () => {
  await render(<Greeting name="grace" />);
  expect(screen.getByText("Hello grace")).toBeTruthy();
});
