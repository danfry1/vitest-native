import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import {
  Button,
  Pressable,
  Text,
  TouchableHighlight,
  TouchableNativeFeedback,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import { afterEach, expect, test, vi } from "vitest";

// Regression guard for #18 (block press on disabled mocks under RNTL v14).
//
// RNTL >=14 made render/fireEvent async and resolves press handlers via
// findEventHandlerFromFiber, which walks the composite fiber and re-finds
// onPress on the wrapping forwardRef mock — so the host-prop stripping from #4
// no longer blocks the press on its own. The mock marks disabled hosts with
// pointerEvents:"none" so RNTL's isEventEnabled() rejects the press.
//
// This is the ONLY combination in CI that pairs the mock engine with RNTL 14
// (unit tests run RNTL 12.9; the other consumer fixtures use the native
// engine), so without this fixture the fix is unguarded. NOTE: render and
// fireEvent MUST be awaited under RNTL 14.
afterEach(() => cleanup());

test("disabled Pressable does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <Pressable testID="p" onPress={onPress} disabled>
      <Text>press</Text>
    </Pressable>,
  );
  expect(screen.getByTestId("p").props.pointerEvents).toBe("none");
  await fireEvent.press(screen.getByTestId("p"));
  expect(onPress).not.toHaveBeenCalled();
});

test("disabled TouchableOpacity does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <TouchableOpacity testID="to" onPress={onPress} disabled>
      <Text>press</Text>
    </TouchableOpacity>,
  );
  await fireEvent.press(screen.getByTestId("to"));
  expect(onPress).not.toHaveBeenCalled();
});

test("disabled TouchableHighlight does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <TouchableHighlight testID="th" onPress={onPress} disabled>
      <Text>press</Text>
    </TouchableHighlight>,
  );
  await fireEvent.press(screen.getByTestId("th"));
  expect(onPress).not.toHaveBeenCalled();
});

test("disabled TouchableWithoutFeedback does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <TouchableWithoutFeedback testID="twf" onPress={onPress} disabled>
      <Text>press</Text>
    </TouchableWithoutFeedback>,
  );
  await fireEvent.press(screen.getByTestId("twf"));
  expect(onPress).not.toHaveBeenCalled();
});

test("disabled TouchableNativeFeedback does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <TouchableNativeFeedback testID="tnf" onPress={onPress} disabled>
      <Text>press</Text>
    </TouchableNativeFeedback>,
  );
  await fireEvent.press(screen.getByTestId("tnf"));
  expect(onPress).not.toHaveBeenCalled();
});

test("disabled Button does not fire onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(<Button testID="btn" title="press" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByTestId("btn"));
  expect(onPress).not.toHaveBeenCalled();
});

test("enabled Pressable still fires onPress (mock + RNTL 14)", async () => {
  const onPress = vi.fn();
  await render(
    <Pressable testID="enabled" onPress={onPress}>
      <Text>press</Text>
    </Pressable>,
  );
  expect(screen.getByTestId("enabled").props.pointerEvents).toBeUndefined();
  await fireEvent.press(screen.getByTestId("enabled"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
