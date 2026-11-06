// The opt-out reached through a shared helper the file imports, not imported directly.
import { Text } from "react-native";
import { beforeAll, expect, it } from "vitest";
import { render, screen } from "./helpers";

beforeAll(async () => {
  await render(<Text>shared</Text>);
});

it("renders once for the file", () => {
  expect(screen.getByText("shared")).toBeTruthy();
});

it("keeps that render for the next test", () => {
  expect(screen.queryByText("shared"), "the helper's opt-out kept the tree mounted").not.toBeNull();
});
