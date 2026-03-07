import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';

interface GreetingProps {
  name: string;
  onPress?: () => void;
}

export function Greeting({ name, onPress }: GreetingProps) {
  const platform = Platform.OS;

  return (
    <View>
      <Text>{`Hello, ${name}!`}</Text>
      <Text>{`Running on ${platform}`}</Text>
      {onPress && (
        <Pressable onPress={onPress} accessibilityRole="button">
          <Text>Say Hello</Text>
        </Pressable>
      )}
    </View>
  );
}
