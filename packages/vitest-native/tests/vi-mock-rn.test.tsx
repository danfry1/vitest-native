import { describe, it, expect, vi } from "vitest";
import { Alert, Platform, StyleSheet, View, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

// A test's own vi.mock('react-native') REPLACES the registration the setup file
// makes, so the factory's importOriginal() has to resolve to the full mock — not an
// empty module. Without that, the near-universal spread-and-override form silently
// drops every export the test did not name.
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return { ...actual, Alert: { alert: vi.fn(), prompt: vi.fn() } };
});

describe("vi.mock('react-native') under the mock engine", () => {
  it("replaces the mocked export", () => {
    Alert.alert("title");
    expect(vi.isMockFunction(Alert.alert)).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith("title");
  });

  it("keeps every unnamed export", () => {
    expect(Platform.OS).toBe("ios");
    expect(StyleSheet.flatten([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });

  it("still renders components", async () => {
    await render(
      <View testID="root">
        <Text>Hello</Text>
      </View>,
    );
    expect(screen.getByTestId("root")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
