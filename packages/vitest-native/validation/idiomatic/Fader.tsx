import * as React from "react";
import { Animated, Text } from "react-native";

// A real Animated fade-in (no monkeypatching). Drives opacity 0 -> 1 over 200ms
// with the JS driver, so a test can advance timers and assert the resolved style.
export function Fader({ children }: { children: React.ReactNode }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [opacity]);
  return (
    <Animated.View testID="fader" style={{ opacity }}>
      <Text>{children}</Text>
    </Animated.View>
  );
}
