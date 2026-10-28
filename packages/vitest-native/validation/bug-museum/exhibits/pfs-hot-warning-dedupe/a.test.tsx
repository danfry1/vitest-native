import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

function List() {
  return <View>{[1, 2].map((n) => <Text>{n}</Text>)}</View>;
}

// A test that guards against a regression by asserting React's missing-key warning.
test("React warns about a list without keys", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<List />);
  const warned = spy.mock.calls.some((c) => /unique "key"/.test(String(c[0])));
  console.log(`[leak:warn] ${expect.getState().testPath?.split("/").pop()} key warning seen = ${warned}`);
  spy.mockRestore();
  expect(warned).toBe(true);
});
