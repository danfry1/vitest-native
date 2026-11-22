// One of two identical files: Gesture Handler's Pressable. The native engine runs the
// library itself with its own Jest setup, so this checks it under freshRuntime too.
import React from "react";
import { Text } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { fireEvent, render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

test("a Pressable renders and calls onPress", async () => {
  const onPress = vi.fn();
  await render(
    <Pressable onPress={onPress}>
      <Text>press me</Text>
    </Pressable>,
  );
  await fireEvent.press(screen.getByText("press me"));
  expect(onPress, "the Pressable's onPress").toHaveBeenCalledTimes(1);
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});
