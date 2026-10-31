// A link inside a sentence: <Text>read the <Text accessibilityRole="link">docs</Text></Text>.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

test("a nested Text link is findable by role", async () => {
  await render(
    <Text>
      read the <Text accessibilityRole="link">docs</Text>
    </Text>,
  );
  expect(screen.getByRole("link", { name: "docs" })).toBeTruthy();
});
