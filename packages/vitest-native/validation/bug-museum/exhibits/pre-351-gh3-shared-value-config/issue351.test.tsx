// GH 3 hook gestures with a shared-value config, as installed.
import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import * as GH from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { useSharedValue } from "react-native-reanimated";
import { expect, test } from "vitest";

const gh = GH as unknown as Record<string, (...args: unknown[]) => unknown>;

test("a pan gesture enabled by a shared value mounts beside a tap", async () => {
  let taps = 0;
  function C() {
    const enabled = useSharedValue(true);
    const tap = gh.useTapGesture({ testID: "tap", onActivate: () => void taps++ });
    const pan = gh.usePanGesture({ testID: "pan", enabled, onActivate: () => {} });
    const both = gh.useSimultaneousGestures(tap, pan);
    return (
      <GH.GestureDetector gesture={both as never}>
        <View />
      </GH.GestureDetector>
    );
  }
  await render(
    <GH.GestureHandlerRootView>
      <C />
    </GH.GestureHandlerRootView>,
  );
  fireGestureHandler(getByGestureTestId("tap"));
  expect(taps).toBe(1);
});
