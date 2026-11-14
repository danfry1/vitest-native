import React, { useId } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { test } from "vitest";
import { observe, recall } from "../audit";

function Label() {
  return <Text testID="label">{useId()}</Text>;
}

test("observes", async () => {
  await render(<Label />);
  observe("react.use-id", {
    startsOver: screen.getByTestId("label").props.children === recall("first-use-id"),
  });
});
