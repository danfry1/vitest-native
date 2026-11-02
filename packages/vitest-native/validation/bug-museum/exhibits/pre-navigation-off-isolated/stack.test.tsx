// A real React Navigation native stack, no presets in the way.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { expect, test } from "vitest";

const Stack = createNativeStackNavigator();

test("a real native stack renders its screen", async () => {
  await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home">{() => <Text>Body</Text>}</Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>,
  );
  expect(screen.getByText("Body")).toBeTruthy();
});
