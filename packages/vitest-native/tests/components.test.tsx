import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { rntlMajor } from "./support/rntl";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  Button,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TouchableNativeFeedback,
} from "react-native";

describe("Component rendering", () => {
  it("renders View with children", async () => {
    await render(
      <View testID="container">
        <Text>Hello</Text>
      </View>,
    );
    expect(screen.getByTestId("container")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders Text", async () => {
    await render(<Text>World</Text>);
    expect(screen.getByText("World")).toBeTruthy();
  });

  it("handles TextInput", async () => {
    const onChange = vi.fn();
    await render(<TextInput testID="input" onChangeText={onChange} />);
    const input = screen.getByTestId("input");
    await fireEvent.changeText(input, "test value");
    expect(onChange).toHaveBeenCalledWith("test value");
  });

  it("handles Pressable onPress", async () => {
    const onPress = vi.fn();
    await render(
      <Pressable testID="btn" onPress={onPress}>
        <Text>Press me</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders Image", async () => {
    await render(<Image testID="img" source={{ uri: "https://example.com/img.png" }} />);
    expect(screen.getByTestId("img")).toBeTruthy();
  });

  it("renders ScrollView with children", async () => {
    await render(
      <ScrollView testID="scroll">
        <Text>Scrollable content</Text>
      </ScrollView>,
    );
    expect(screen.getByTestId("scroll")).toBeTruthy();
    expect(screen.getByText("Scrollable content")).toBeTruthy();
  });

  it("Button onPress fires when pressed via testID", async () => {
    const onPress = vi.fn();
    await render(<Button testID="my-btn" title="Tap me" onPress={onPress} />);
    await fireEvent.press(screen.getByTestId("my-btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("Button renders title text", async () => {
    await render(<Button title="Submit" onPress={() => {}} />);
    expect(screen.getByText("Submit")).toBeTruthy();
  });

  it("Button does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(<Button testID="disabled-btn" title="Nope" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByTestId("disabled-btn"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });

  it("Button has accessibility props on the pressable element", async () => {
    await render(<Button testID="a11y-btn" title="Action" onPress={() => {}} />);
    const btn = screen.getByTestId("a11y-btn");
    expect(btn.props.accessibilityRole).toBe("button");
    expect(btn.props.accessible).toBe(true);
    expect(btn.props.accessibilityLabel).toBe("Action");
  });

  it("Pressable does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(
      <Pressable testID="disabled-pressable" onPress={onPress} disabled>
        <Text>Press me</Text>
      </Pressable>,
    );
    await fireEvent.press(screen.getByTestId("disabled-pressable"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });

  it("TouchableOpacity does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(
      <TouchableOpacity testID="disabled-to" onPress={onPress} disabled>
        <Text>Tap</Text>
      </TouchableOpacity>,
    );
    await fireEvent.press(screen.getByTestId("disabled-to"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });

  it("TouchableHighlight does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(
      <TouchableHighlight testID="disabled-th" onPress={onPress} disabled>
        <Text>Tap</Text>
      </TouchableHighlight>,
    );
    await fireEvent.press(screen.getByTestId("disabled-th"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });

  it("TouchableWithoutFeedback does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(
      <TouchableWithoutFeedback testID="disabled-twf" onPress={onPress} disabled>
        <Text>Tap</Text>
      </TouchableWithoutFeedback>,
    );
    await fireEvent.press(screen.getByTestId("disabled-twf"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });

  it("TouchableNativeFeedback does not fire onPress when disabled", async () => {
    const onPress = vi.fn();
    await render(
      <TouchableNativeFeedback testID="disabled-tnf" onPress={onPress} disabled>
        <Text>Tap</Text>
      </TouchableNativeFeedback>,
    );
    await fireEvent.press(screen.getByTestId("disabled-tnf"));
    // RNTL >=14 made fireEvent.press disabled-aware; 12/13 fire regardless.
    if (rntlMajor >= 14) expect(onPress).not.toHaveBeenCalled();
  });
});
