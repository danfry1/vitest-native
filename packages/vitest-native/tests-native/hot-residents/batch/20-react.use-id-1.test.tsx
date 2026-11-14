import React, { useId } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { test } from "vitest";
import { remember } from "../audit";

function Label() {
  return <Text testID="label">{useId()}</Text>;
}

test("renders a useId", async () => {
  await render(<Label />);
  remember("first-use-id", screen.getByTestId("label").props.children);
});
