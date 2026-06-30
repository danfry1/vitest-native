import * as React from "react";
import { Pressable, Text, View } from "react-native";

export function Counter({ start = 0 }: { start?: number }) {
  const [count, setCount] = React.useState(start);
  return (
    <View>
      <Text testID="count">Count: {count}</Text>
      <Pressable accessibilityRole="button" onPress={() => setCount((c) => c + 1)}>
        <Text>Increment</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setCount(start)}>
        <Text>Reset</Text>
      </Pressable>
    </View>
  );
}
