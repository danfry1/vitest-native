// Scrolling through Reanimated, as installed.
import React from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useScrollOffset } from "react-native-reanimated";
import { expect, test } from "vitest";

test("useAnimatedScrollHandler forwards onScroll", async () => {
  const seen: number[] = [];
  function C() {
    const onScroll = useAnimatedScrollHandler({ onScroll: (event) => void seen.push(event.contentOffset.y) });
    return (
      <Animated.ScrollView testID="list" onScroll={onScroll}>
        <Text>row</Text>
      </Animated.ScrollView>
    );
  }
  await render(<C />);
  await fireEvent.scroll(screen.getByTestId("list"), { nativeEvent: { contentOffset: { y: 7 } } });
  expect(seen).toEqual([7]);
});

test("useScrollOffset is a shared value", async () => {
  let offset: { get?: unknown } | undefined;
  function C() {
    const ref = useAnimatedRef<Animated.ScrollView>();
    offset = useScrollOffset(ref) as never;
    return (
      <Animated.ScrollView ref={ref}>
        <Text>row</Text>
      </Animated.ScrollView>
    );
  }
  await render(<C />);
  expect(typeof offset?.get).toBe("function");
});
