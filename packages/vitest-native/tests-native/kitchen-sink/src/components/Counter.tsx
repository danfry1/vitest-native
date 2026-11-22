import * as React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { count } from "resident-singleton";
import { track } from "../services/analytics";

export function Counter({ label }: { label: string }) {
  const [value, setValue] = React.useState(0);
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  // A worklet: the worklets Babel plugin compiles this file (projectBabel).
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View style={{ paddingTop: insets.top }}>
      <Animated.View style={style}>
        <Text>{`${label}: ${value}`}</Text>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setValue((v) => v + 1);
          opacity.value = withTiming(0.5);
          track(`press ${count()}`);
        }}
      >
        <Text>Add</Text>
      </Pressable>
    </View>
  );
}
