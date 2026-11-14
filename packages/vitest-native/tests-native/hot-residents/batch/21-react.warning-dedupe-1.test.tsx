import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { test, vi } from "vitest";

function List() {
  return <View>{[1, 2].map((n) => <Text>{n}</Text>)}</View>;
}

test("renders a list without keys, so React warns once", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<List />);
  spy.mockRestore();
});
