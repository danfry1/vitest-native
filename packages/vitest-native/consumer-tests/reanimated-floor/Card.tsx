import React from "react";
import { Pressable, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export function Card({ onPress }: { onPress: () => void }) {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <Pressable
      onPress={() => {
        offset.value = withTiming(10);
        onPress();
      }}
    >
      <Animated.View style={style} testID="box" />
      <Text>Press</Text>
    </Pressable>
  );
}
