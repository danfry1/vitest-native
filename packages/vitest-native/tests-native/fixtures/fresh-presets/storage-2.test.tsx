// One of two identical files: the mmkv preset's useMMKVString(), which keeps its value
// with useState from the rendering React.
import React from "react";
import { Pressable, Text } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

function Name() {
  const [name, setName] = useMMKVString(`name-${Math.random()}`);
  return (
    <Pressable testID="set" onPress={() => setName("stored")}>
      <Text>name {name ?? "none"}</Text>
    </Pressable>
  );
}

test("useMMKVString() re-renders with the value it set", async () => {
  await render(<Name />);
  expect(screen.getByText("name none")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId("set")));
  expect(screen.getByText("name stored")).toBeTruthy();
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});
