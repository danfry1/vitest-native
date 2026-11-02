// One of three identical files using Gesture Handler 3 + Reanimated 4.7 (their own Jest
// mocks under the native engine). The first file in the worker pays for the libraries;
// a later file must not resolve and re-read them all again.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { GestureDetector, GestureHandlerRootView, Gesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { expect, test } from "vitest";

type Counts = { read: number; resolve: number; files: number; start: { read: number; resolve: number } };
const g = globalThis as { __museumCounts?: Counts };

function Row() {
  const x = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: x.value }));
  return (
    <GestureDetector gesture={Gesture.Tap()}>
      <Animated.View style={style}>
        <Text>row c</Text>
      </Animated.View>
    </GestureDetector>
  );
}

test("file c renders, and a warm file costs few resolutions and reads", async () => {
  await render(
    <GestureHandlerRootView>
      <Row />
    </GestureHandlerRootView>,
  );
  expect(screen.getByText("row c")).toBeTruthy();
  const now = g.__museumCounts!;
  const start = now.start;
  const cost = { resolve: now.resolve - start.resolve, read: now.read - start.read };
  console.log(`[museum:g3] file c (#${now.files} in this worker): ${JSON.stringify(cost)}`);
  if (now.files > 1) {
    // Thresholds from the M0 G3 measurements: before #336 ~14 resolutions and ~13 reads
    // per file; the library-mock graph on main ~168 and ~353; with the fix ~22 and ~62.
    expect(cost.resolve, "a warm file's Module._resolveFilename calls").toBeLessThan(60);
    expect(cost.read, "a warm file's fs.readFileSync calls").toBeLessThan(150);
  }
});
