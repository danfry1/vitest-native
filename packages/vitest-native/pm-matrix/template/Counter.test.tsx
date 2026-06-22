import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View, Text, Pressable } from "react-native";

function Counter() {
  const [n, setN] = useState(0);
  return (
    <View>
      <Text>count: {n}</Text>
      <Pressable onPress={() => setN((x) => x + 1)}>
        <Text>inc</Text>
      </Pressable>
    </View>
  );
}

describe("native engine across package managers", () => {
  // Hooks (useState) are the canary: a dual-React install resolves two copies and
  // the hooks dispatcher is null → "Cannot read properties of null (reading 'use…')".
  it("renders hook state", () => {
    render(<Counter />);
    expect(screen.getByText("count: 0")).toBeTruthy();
  });
  it("updates state via fireEvent (real Pressable + React reconciliation)", () => {
    render(<Counter />);
    fireEvent.press(screen.getByText("inc"));
    expect(screen.getByText("count: 1")).toBeTruthy();
  });
});
