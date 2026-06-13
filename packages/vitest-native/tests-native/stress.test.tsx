// Boundary stress suite: exercises the RN surfaces a real app actually touches
// but the basic render/conformance tests don't — stateful native APIs, hooks,
// interaction flows, and timer-driven animations. Each test is independent so a
// single boundary gap surfaces as one failure, not a cascade. Failures here are
// boundary holes to plug in src/native/boundary.mjs.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import {
  View,
  Text,
  Switch,
  Modal,
  FlatList,
  ScrollView,
  RefreshControl,
  AppState,
  Keyboard,
  Linking,
  Dimensions,
  AccessibilityInfo,
  Vibration,
  Alert,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
  useColorScheme,
} from "react-native";

describe("native engine: stateful native APIs", () => {
  it("AppState exposes currentState and a removable listener", () => {
    expect(typeof AppState.currentState === "string" || AppState.currentState == null).toBe(true);
    const sub = AppState.addEventListener("change", () => {});
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("Keyboard.addListener returns a removable subscription", () => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {});
    expect(typeof sub.remove).toBe("function");
    sub.remove();
    expect(() => Keyboard.dismiss()).not.toThrow();
  });

  it("Linking.canOpenURL / getInitialURL resolve without throwing", async () => {
    await expect(Linking.canOpenURL("https://example.com")).resolves.toBeDefined();
    await expect(Linking.getInitialURL()).resolves.not.toThrow?.();
  });

  it("Dimensions.addEventListener fires nothing but registers cleanly", () => {
    const sub = Dimensions.addEventListener("change", () => {});
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("AccessibilityInfo.isScreenReaderEnabled resolves to a boolean", async () => {
    const enabled = await AccessibilityInfo.isScreenReaderEnabled();
    expect(typeof enabled).toBe("boolean");
    expect(() => AccessibilityInfo.announceForAccessibility("hi")).not.toThrow();
  });

  it("Vibration / Alert are callable", () => {
    expect(() => Vibration.vibrate(10)).not.toThrow();
    expect(() => Alert.alert("Title", "Message")).not.toThrow();
  });

  it("Platform.select resolves the ios branch", () => {
    expect(Platform.select({ ios: "i", android: "a", default: "d" })).toBe("i");
  });
});

describe("native engine: hooks", () => {
  it("useWindowDimensions returns live dimensions", () => {
    let dims: { width: number; height: number } | null = null;
    function C() {
      dims = useWindowDimensions();
      return <Text>{`${dims.width}x${dims.height}`}</Text>;
    }
    render(<C />);
    expect(dims!.width).toBeGreaterThan(0);
    expect(dims!.height).toBeGreaterThan(0);
  });

  it("useColorScheme returns a scheme or null", () => {
    let scheme: unknown;
    function C() {
      scheme = useColorScheme();
      return <Text>scheme</Text>;
    }
    render(<C />);
    expect(scheme === "light" || scheme === "dark" || scheme == null).toBe(true);
  });
});

describe("native engine: interaction flows", () => {
  it("Switch toggles via onValueChange", () => {
    function Toggle() {
      const [on, setOn] = React.useState(false);
      return (
        <View>
          <Switch value={on} onValueChange={setOn} testID="sw" />
          <Text>{on ? "ON" : "OFF"}</Text>
        </View>
      );
    }
    render(<Toggle />);
    expect(screen.getByText("OFF")).toBeTruthy();
    fireEvent(screen.getByTestId("sw"), "valueChange", true);
    expect(screen.getByText("ON")).toBeTruthy();
  });

  it("Modal honors the visible prop", () => {
    function M({ open }: { open: boolean }) {
      return (
        <Modal visible={open}>
          <Text>modal-body</Text>
        </Modal>
      );
    }
    const { rerender, queryByText } = render(<M open={false} />);
    rerender(<M open />);
    expect(queryByText("modal-body")).toBeTruthy();
  });

  it("FlatList renders items and fires onRefresh via RefreshControl", () => {
    const onRefresh = vi.fn();
    render(
      <FlatList
        data={[1, 2, 3]}
        keyExtractor={(x) => String(x)}
        renderItem={({ item }) => <Text>{`item-${item}`}</Text>}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} testID="rc" />}
      />,
    );
    expect(screen.getByText("item-1")).toBeTruthy();
    fireEvent(screen.getByTestId("rc"), "refresh");
    expect(onRefresh).toHaveBeenCalled();
  });

  it("ScrollView renders content and wires onScroll to the host", () => {
    const onScroll = vi.fn();
    render(
      <ScrollView onScroll={onScroll} testID="sv">
        <Text>content</Text>
      </ScrollView>,
    );
    expect(screen.getByText("content")).toBeTruthy();
    // Real RN wires the host's onScroll to _handleScroll, which forwards to the
    // user's onScroll. Invoking it (as the device does) reaches the handler —
    // proof the boundary + ScrollView wiring is correct.
    const host: any = screen.getByTestId("sv");
    host.props.onScroll({
      nativeEvent: {
        contentOffset: { x: 0, y: 100 },
        contentSize: { height: 500, width: 100 },
        layoutMeasurement: { height: 100, width: 100 },
      },
    });
    expect(onScroll).toHaveBeenCalled();
  });

  // Previously a known nuance: RNTL's fireEvent.scroll didn't reach onScroll
  // because real ScrollView attaches onStartShouldSetResponder (→false) to its
  // host, which RNTL treats as a disabled touch responder. The native boundary
  // now drops those responder-negotiation props from the RCTScrollView host
  // (matching RN's own jest ScrollView mock), so fireEvent.scroll works.
  it("fireEvent.scroll(scrollView) reaches onScroll via RNTL", () => {
    const onScroll = vi.fn();
    render(
      <ScrollView onScroll={onScroll} testID="sv2">
        <Text>content</Text>
      </ScrollView>,
    );
    fireEvent.scroll(screen.getByTestId("sv2"), {
      nativeEvent: {
        contentOffset: { x: 0, y: 120 },
        contentSize: { height: 600, width: 100 },
        layoutMeasurement: { height: 100, width: 100 },
      },
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset.y).toBe(120);
  });
});

describe("native engine: animations", () => {
  it("Animated.timing drives a JS-driven value to completion", () => {
    vi.useFakeTimers();
    try {
      const v = new Animated.Value(0);
      const done = vi.fn();
      Animated.timing(v, {
        toValue: 100,
        duration: 200,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(done);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      const listener = vi.fn();
      const id = v.addListener(listener);
      v.removeListener(id);
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Animated.event + interpolation compute without throwing", () => {
    const v = new Animated.Value(0);
    const handler = Animated.event([{ nativeEvent: { contentOffset: { y: v } } }], {
      useNativeDriver: false,
    });
    expect(() => handler({ nativeEvent: { contentOffset: { y: 42 } } })).not.toThrow();
    const opacity = v.interpolate({ inputRange: [0, 100], outputRange: [0, 1] });
    expect((opacity as any).__getValue?.() ?? (opacity as any).getValue?.()).toBeTypeOf("number");
  });
});
