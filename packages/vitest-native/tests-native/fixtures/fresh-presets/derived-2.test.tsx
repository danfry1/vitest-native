// One of two identical files: the Reanimated preset's corrected hooks, which keep state
// per component with the rendering React, and useDerivedValue, which subscribes to the
// shared values it reads in an effect and stops on unmount.
import React from "react";
import { Text } from "react-native";
import Animated, {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

test("a derived value follows its inputs after mount, and stops after unmount", async () => {
  let progress!: SharedValue<number>;
  let sweep!: SharedValue<number>;
  function Arc() {
    progress = useSharedValue(0);
    sweep = useDerivedValue(() => progress.get() * 360);
    return <Text>arc</Text>;
  }
  const { unmount } = await render(<Arc />);
  expect(screen.getByText("arc")).toBeTruthy();
  progress.set(0.5);
  expect(sweep.get(), "the derived value after its input changed").toBe(180);
  const heard = vi.fn();
  sweep.addListener(1, heard);
  await unmount();
  progress.set(1);
  expect(heard, "a listener after unmount").not.toHaveBeenCalled();
});

test("a shared value is kept per component across renders", async () => {
  const values: SharedValue<number>[] = [];
  function Counter({ n }: { n: number }) {
    values.push(useSharedValue(n));
    return <Animated.View testID="animated" />;
  }
  const { rerender } = await render(<Counter n={1} />);
  await rerender(<Counter n={2} />);
  expect(screen.getByTestId("animated")).toBeTruthy();
  expect(values[1], "the second render's shared value").toBe(values[0]);
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});
