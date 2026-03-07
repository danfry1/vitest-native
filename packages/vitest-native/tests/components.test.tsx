import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View, Text, TextInput, Pressable, Image, ScrollView } from "react-native";

describe("Component rendering", () => {
  it("renders View with children", () => {
    render(
      <View testID="container">
        <Text>Hello</Text>
      </View>,
    );
    expect(screen.getByTestId("container")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders Text", () => {
    render(<Text>World</Text>);
    expect(screen.getByText("World")).toBeTruthy();
  });

  it("handles TextInput", () => {
    const onChange = vi.fn();
    render(<TextInput testID="input" onChangeText={onChange} />);
    const input = screen.getByTestId("input");
    fireEvent.changeText(input, "test value");
    expect(onChange).toHaveBeenCalledWith("test value");
  });

  it("handles Pressable onPress", () => {
    const onPress = vi.fn();
    render(
      <Pressable testID="btn" onPress={onPress}>
        <Text>Press me</Text>
      </Pressable>,
    );
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders Image", () => {
    render(<Image testID="img" source={{ uri: "https://example.com/img.png" }} />);
    expect(screen.getByTestId("img")).toBeTruthy();
  });

  it("renders ScrollView with children", () => {
    render(
      <ScrollView testID="scroll">
        <Text>Scrollable content</Text>
      </ScrollView>,
    );
    expect(screen.getByTestId("scroll")).toBeTruthy();
    expect(screen.getByText("Scrollable content")).toBeTruthy();
  });
});
