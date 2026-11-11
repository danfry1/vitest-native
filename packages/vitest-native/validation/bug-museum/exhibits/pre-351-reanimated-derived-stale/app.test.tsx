import React from "react";
import { render, screen } from "@testing-library/react-native";
import { type SharedValue, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { Canvas, Circle } from "react-native-skia";

// A child React skips (memoized, as React Compiler memoizes it) passes a derived value
// to Skia, which reads it after the shared value it follows changes.
const Ring = React.memo(function Ring({ progress }: { progress: SharedValue<number> }) {
  const radius = useDerivedValue(() => 10 + progress.get() * 100);
  return (
    <Canvas testID="ring">
      <Circle cx={0} cy={0} r={radius} color="red" />
    </Canvas>
  );
});

function Screen() {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.set(0.5);
  }, [progress]);
  return <Ring progress={progress} />;
}

test("a derived value follows its shared value without a render", async () => {
  const { rerender } = await render(<Screen />);
  await rerender(<Screen />);
  const circle = screen.getByTestId("ring").children[0] as { props: { r: SharedValue<number> } };
  expect(circle.props.r.value).toBe(60);
});
