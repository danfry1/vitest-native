import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { expect, it } from "vitest";

function Fader() {
  const [label, setLabel] = useState("idle");
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const tap = Gesture.Tap();
  return (
    <GestureHandlerRootView>
      <GestureDetector gesture={tap}>
        <Animated.View testID="fader" style={style}>
          <Pressable
            onPress={() => {
              opacity.value = withTiming(0, undefined, () => scheduleOnRN(setLabel, "faded"));
            }}
          >
            <Text>{label}</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

it("renders reanimated, worklets and gesture-handler together", async () => {
  await render(<Fader />);
  expect(screen.getByTestId("fader")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("idle"));
  expect(await screen.findByText("faded")).toBeOnTheScreen();
});
