import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

// A correct file. It must not depend on what an earlier file on its worker did.
test("an ordinary render", async () => {
  await render(<Text>hello</Text>);
  expect(screen.getByText("hello")).toBeTruthy();
});
