/**
 * The real @react-navigation/native-stack over the react-native-screens preset
 * (presets: { navigation: false }; see vitest.native-stack.config.mts).
 *
 * native-stack passes headerLeft, headerRight and a custom headerTitle to
 * ScreenStackItem as `headerConfig.children`. react-native-screens' ScreenStackItem
 * renders `<ScreenStackHeaderConfig {...headerConfig} />` after the screen's
 * content, also when the header is hidden, so the preset's stub must too.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator();

/** The host type of the nearest ancestor of `testID` whose type is `type`, if any. */
function ancestorOfType(testID: string, type: string) {
  let node = screen.getByTestId(testID).parent;
  while (node && node.type !== type) node = node.parent;
  return node?.type;
}

describe("native-stack header over the screens preset", () => {
  it("renders headerLeft, headerRight and headerTitle with the screen", async () => {
    await render(
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            options={{
              headerLeft: () => (
                <Pressable testID="header-left">
                  <Text>Back</Text>
                </Pressable>
              ),
              headerRight: () => (
                <Pressable testID="header-right">
                  <Text>Edit</Text>
                </Pressable>
              ),
              headerTitle: () => <Text testID="header-title">Custom title</Text>,
            }}
          >
            {() => <Text>Home body</Text>}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>,
    );

    expect(screen.getByText("Home body")).toBeTruthy();
    expect(screen.getByTestId("header-left")).toBeTruthy();
    expect(screen.getByTestId("header-right")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByTestId("header-title")).toBeTruthy();
    // Rendered by the preset's header stub, not by react-native-screens itself (whose
    // host is RNSScreenStackHeaderConfig), so this test cannot pass on the real one.
    expect(ancestorOfType("header-right", "ScreenStackHeaderConfig")).toBe(
      "ScreenStackHeaderConfig",
    );
  });

  it("renders a hidden header's elements too, as react-native-screens does", async () => {
    await render(
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Hidden"
            options={{
              headerShown: false,
              headerRight: () => <Text testID="hidden-header-right">R</Text>,
            }}
          >
            {() => <Text>Hidden body</Text>}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>,
    );

    expect(screen.getByText("Hidden body")).toBeTruthy();
    expect(screen.getByTestId("hidden-header-right")).toBeTruthy();
  });
});
