// A real native-stack navigator (navigation: false) under the screens preset.
import React from "react";
import { Pressable, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { expect, test } from "vitest";

const Stack = createNativeStackNavigator();

type Host = { props?: { accessibilityLabel?: string }; children?: unknown[] | null };
function labels(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(labels);
  if (!node || typeof node !== "object") return [];
  const host = node as Host;
  const own = host.props?.accessibilityLabel ? [host.props.accessibilityLabel] : [];
  return [...own, ...(host.children ?? []).flatMap(labels)];
}

test("the native-stack header renders its headerLeft", async () => {
  await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          options={{
            title: "HomeTitle",
            headerLeft: () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Go back">
                <Text>Back</Text>
              </Pressable>
            ),
          }}
        >
          {() => <Text>Body</Text>}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>,
  );
  expect(screen.getByText("Body")).toBeTruthy();
  // Read through the host tree (toJSON), the one shape every RNTL major agrees on.
  expect(labels(screen.toJSON())).toContain("Go back");
  expect(screen.getByLabelText("Go back")).toBeTruthy();
});
