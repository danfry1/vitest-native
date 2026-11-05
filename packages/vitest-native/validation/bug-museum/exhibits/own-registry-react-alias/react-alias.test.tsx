// One React, with a dedupe alias: the component's hooks, React Native's components and
// the renderer must all use the React the alias names.
import { useState } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

function Counter() {
  const [count] = useState(1);
  return <Text>count {count}</Text>;
}

test("a component with hooks renders under a React dedupe alias", async () => {
  await render(<Counter />);
  expect(screen.getByText("count 1")).toBeTruthy();
});
