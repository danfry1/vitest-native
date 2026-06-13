import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, test } from "vitest";
import { setDimensions } from "vitest-native/helpers";

test("runs a hoisted packed monorepo consumer with RNTL 14", async () => {
  setDimensions({ width: 430, height: 932 });
  await render(
    <View testID="root">
      <Text>Packed monorepo consumer</Text>
    </View>,
  );

  expect(screen.getByTestId("root")).toHaveTextContent("Packed monorepo consumer");
});
