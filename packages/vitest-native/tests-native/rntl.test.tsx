import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View, Text, Pressable, TextInput } from "react-native";

function Counter() {
  const [n, setN] = React.useState(0);
  return (
    <View>
      <Text>count: {n}</Text>
      <Pressable onPress={() => setN((x) => x + 1)}>
        <Text>increment</Text>
      </Pressable>
    </View>
  );
}

describe("RNTL under native engine", () => {
  it("renders and queries by text", () => {
    render(<Counter />);
    expect(screen.getByText("count: 0")).toBeTruthy();
  });

  it("fireEvent.press updates state (real Pressable + React)", () => {
    render(<Counter />);
    fireEvent.press(screen.getByText("increment"));
    expect(screen.getByText("count: 1")).toBeTruthy();
  });

  it("TextInput onChangeText fires", () => {
    const onChange = vi.fn();
    render(<TextInput placeholder="name" onChangeText={onChange} />);
    fireEvent.changeText(screen.getByPlaceholderText("name"), "hello");
    expect(onChange).toHaveBeenCalledWith("hello");
  });
});
