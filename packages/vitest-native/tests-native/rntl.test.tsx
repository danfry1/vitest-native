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
  it("renders and queries by text", async () => {
    await render(<Counter />);
    expect(screen.getByText("count: 0")).toBeTruthy();
  });

  it("fireEvent.press updates state (real Pressable + React)", async () => {
    await render(<Counter />);
    await fireEvent.press(screen.getByText("increment"));
    expect(screen.getByText("count: 1")).toBeTruthy();
  });

  it("TextInput onChangeText fires", async () => {
    const onChange = vi.fn();
    await render(<TextInput placeholder="name" onChangeText={onChange} />);
    await fireEvent.changeText(screen.getByPlaceholderText("name"), "hello");
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  // Real RN renders a nested <Text> as the host "RCTVirtualText". Under RNTL 14
  // (test-renderer) a string child must live under a registered text host, so
  // nested/composite text would crash ("Text strings must be rendered within a
  // <Text> component") unless RCTVirtualText is registered as a text host. See the
  // native setup. This is the case jest's flat "Text" mock never exercises.
  it("renders nested <Text> and matches composite text", async () => {
    await render(
      <Text testID="outer">
        Hello <Text>World</Text>
      </Text>,
    );
    // getByText flattens across the nested <Text> (RCTText + RCTVirtualText).
    expect(screen.getByText("Hello World")).toBeTruthy();
    // The nested fragment is independently matchable too.
    expect(screen.getByText("World")).toBeTruthy();
  });

  it("renders deeply nested <Text> without crashing", async () => {
    await render(
      <Text>
        a<Text>b<Text>c</Text></Text>
      </Text>,
    );
    expect(screen.getByText("abc")).toBeTruthy();
  });
});
