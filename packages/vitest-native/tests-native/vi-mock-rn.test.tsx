import { describe, it, expect, vi } from "vitest";
import { Alert, Platform, View, Text, Dimensions } from "react-native";
import { render, screen } from "@testing-library/react-native";

// The single most common thing a migrating Jest suite does to React Native. Under
// the native engine RN still executes for real in Node's graph; the facade the
// plugin serves only moves the MODULE ID into Vitest's registry, which is what
// makes this interception possible.
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return { ...actual, Alert: { alert: vi.fn(), prompt: vi.fn() } };
});

describe("vi.mock('react-native') under the native engine", () => {
  it("replaces the mocked export", () => {
    Alert.alert("title", "message");
    expect(vi.isMockFunction(Alert.alert)).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith("title", "message");
  });

  it("leaves every other export as the real React Native", () => {
    expect(Platform.OS).toBe("ios");
    expect(Dimensions.get("window").width).toBeGreaterThan(0);
  });

  it("still renders real React Native host components", async () => {
    await render(
      <View testID="root">
        <Text>Hello</Text>
      </View>,
    );
    // RCTView, not a stand-in: the component JS that ran is React Native's own.
    expect(screen.getByTestId("root").type).toBe("RCTView");
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
