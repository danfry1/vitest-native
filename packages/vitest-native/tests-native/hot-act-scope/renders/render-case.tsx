// An ordinary file: it renders and finds its text. It must pass whatever an earlier
// file on the same worker did.
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it } from "vitest";

it("renders", async () => {
  await render(<Text>hello</Text>);
  expect(screen.getByText("hello")).toBeTruthy();
});
