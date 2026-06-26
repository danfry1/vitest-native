/**
 * P0 proof: the representative third-party stack (Gesture Handler + Safe Area +
 * Navigation) renders under the native engine via the preset-shadow mechanism —
 * the same self-contained mocks the mock engine uses, shadowing each lib so its
 * native runtime never loads, while the surrounding tree renders through REAL RN.
 *
 * Each lib is installed as a devDependency so this proves auto-detection + correct
 * shadowing. See tests-native/reanimated.test.tsx for the Reanimated equivalent.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  State,
} from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

describe("react-native-gesture-handler under native engine", () => {
  it("GestureHandlerRootView + GestureDetector render through real RN", async () => {
    const tap = Gesture.Tap().onEnd(() => {});
    await render(
      <GestureHandlerRootView testID="gh-root">
        <GestureDetector gesture={tap}>
          <Text>tap me</Text>
        </GestureDetector>
      </GestureHandlerRootView>,
    );
    expect(screen.getByTestId("gh-root")).toBeTruthy();
    expect(screen.getByText("tap me")).toBeTruthy();
  });

  it("State enum is the shadowed mock (no native gesture handler loaded)", () => {
    expect(State.ACTIVE).toBe(4);
    expect(typeof Gesture.Pan).toBe("function");
  });
});

describe("react-native-safe-area-context under native engine", () => {
  function ShowInsets() {
    const insets = useSafeAreaInsets();
    return <Text>top:{insets.top}</Text>;
  }

  it("SafeAreaProvider/SafeAreaView render and useSafeAreaInsets returns mock insets", async () => {
    await render(
      <SafeAreaProvider>
        <SafeAreaView testID="sa-view">
          <ShowInsets />
        </SafeAreaView>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("sa-view")).toBeTruthy();
    expect(screen.getByText("top:47")).toBeTruthy();
  });
});

describe("@react-navigation under native engine", () => {
  const Stack = createNativeStackNavigator();

  function HomeScreen() {
    const navigation = useNavigation();
    expect(typeof navigation.navigate).toBe("function");
    return <Text>Home Screen</Text>;
  }

  it("NavigationContainer + native stack renders the active screen", async () => {
    await render(
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
    expect(screen.getByText("Home Screen")).toBeTruthy();
  });
});
