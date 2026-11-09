// A correct file after hot-resident-mock/a.test.ts in the same worker: RNTL's fireEvent
// reads StyleSheet.flatten from its own react-native.
import React from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

test("a later file in the worker presses a button", async () => {
  const onPress = jest.fn();
  await render(
    <Pressable onPress={onPress}>
      <Text>Try again</Text>
    </Pressable>,
  );
  // RNTL 14's fireEvent is async; awaiting it is harmless on RNTL 13.
  await fireEvent.press(screen.getByText("Try again"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
