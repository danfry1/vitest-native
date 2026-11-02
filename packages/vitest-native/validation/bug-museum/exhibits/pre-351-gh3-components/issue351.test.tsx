// Gesture Handler 3 as installed, no jest.mock.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { FlatList, GestureHandlerRootView, ScrollView, Touchable } from "react-native-gesture-handler";
import { expect, test } from "vitest";

test("GH 3 components render without user mocks", async () => {
  expect(typeof Touchable, "Gesture Handler 3 exports Touchable").not.toBe("undefined");
  await render(
    <GestureHandlerRootView>
      <Touchable onPress={() => {}}>
        <Text>touch</Text>
      </Touchable>
      <ScrollView>
        <Text>scrolled</Text>
      </ScrollView>
      <FlatList data={["row"]} renderItem={({ item }) => <Text>{item}</Text>} keyExtractor={(item) => item} />
    </GestureHandlerRootView>,
  );
  expect(screen.getByText("touch")).toBeTruthy();
  expect(screen.getByText("scrolled")).toBeTruthy();
  expect(screen.getByText("row")).toBeTruthy();
});
