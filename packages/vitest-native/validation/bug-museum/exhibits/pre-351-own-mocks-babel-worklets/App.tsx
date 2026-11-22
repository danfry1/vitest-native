import React from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as GH from "react-native-gesture-handler";

const gh = GH as unknown as Record<string, any>;

export function App({ onPress }: { onPress: () => void }) {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const pan = gh.usePanGesture({ testID: "pan", onUpdate: () => {} });
  const Touchable = gh.Touchable;
  const ScrollView = gh.ScrollView;
  return (
    <GH.GestureHandlerRootView>
      <ScrollView>
        <GH.GestureDetector gesture={pan}>
          <Animated.View style={style} testID="box" />
        </GH.GestureDetector>
        <Touchable
          onPress={() => {
            offset.value = withTiming(10);
            onPress();
          }}
        >
          <Text>Press</Text>
        </Touchable>
      </ScrollView>
    </GH.GestureHandlerRootView>
  );
}
