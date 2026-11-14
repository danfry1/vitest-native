import React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

// A child React skips (memoized, as React Compiler memoizes it) whose style follows a
// shared value that changes after it rendered.
const Bar = React.memo(function Bar({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ width: progress.get() * 100 }));
  return <Animated.View testID="bar" style={style} />;
});

function Screen() {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.set(0.5);
  }, [progress]);
  return <Bar progress={progress} />;
}

test("an animated style follows its shared value without a render", async () => {
  const { rerender } = await render(<Screen />);
  await rerender(<Screen />);
  expect(screen.getByTestId("bar").props.style.width).toBe(50);
});
