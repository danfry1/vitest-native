import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { test, vi } from "vitest";
import { observe } from "../audit";

function List() {
  return <View>{[1, 2].map((n) => <Text>{n}</Text>)}</View>;
}

test("renders a list without keys", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<List />);
  const warned = spy.mock.calls.some((call) => /unique "key"/.test(String(call[0])));
  spy.mockRestore();
  observe("react.warning-dedupe", { warned });
});
