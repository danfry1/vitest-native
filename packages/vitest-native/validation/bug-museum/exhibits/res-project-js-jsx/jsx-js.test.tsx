import React from "react";
import { render, screen } from "@testing-library/react-native";

test("a project .js component with JSX renders", async () => {
  let outcome: string;
  try {
    const { Greeting } = await import("./greeting.js");
    await render(<Greeting name="Ada" />);
    outcome = screen.queryByText("Hello, Ada") ? "rendered" : "not found";
  } catch (error) {
    outcome = `throws: ${String((error as Error).message).split("\n")[0].slice(0, 80)}`;
  }
  expect(outcome, "a project .js file with JSX").toBe("rendered");
});
