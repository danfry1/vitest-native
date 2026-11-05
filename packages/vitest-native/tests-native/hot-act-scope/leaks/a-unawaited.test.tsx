// Passes, but starts an async act() it never awaits. React closes an async act() scope
// only when its result is awaited, so this one stays open after the file ends.
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it } from "vitest";

it("forgets to await an async act", async () => {
  await render(<Text>first file</Text>);
  expect(screen.getByText("first file")).toBeTruthy();
  void act(async () => {
    await new Promise((done) => setTimeout(done, 1000));
  });
});
