// Real React Native renders a nested <Text> as RCTVirtualText. Unless the engine tells
// RNTL that it is a text host, getByText cannot see nested text.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

test("nested Text is queryable by its own text", async () => {
  await render(
    <Text>
      outer <Text>inner</Text>
    </Text>,
  );
  expect(screen.getByText("inner")).toBeTruthy();
});
