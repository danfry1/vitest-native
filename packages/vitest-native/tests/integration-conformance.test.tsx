/**
 * Integration conformance tests — verifies that mocks work together
 * in realistic usage patterns. These test the scenarios that real users
 * encounter: responsive layouts, dark mode, animated transitions,
 * form handling, list rendering with state, etc.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState, useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Animated,
  Dimensions,
  Appearance,
  AppState,
  Keyboard,
  PixelRatio,
  StyleSheet,
  Platform,
  useColorScheme,
  LayoutAnimation,
  ToastAndroid,
  Alert,
  Vibration,
  LogBox,
  AccessibilityInfo,
} from "react-native";

// ---------------------------------------------------------------------------
// Dimensions — stateful set/get/listener lifecycle
// ---------------------------------------------------------------------------

describe("Dimensions lifecycle (conformance)", () => {
  beforeEach(() => {
    (Dimensions as any)._reset();
  });

  it("get returns default window dimensions", () => {
    const win = Dimensions.get("window");
    expect(win).toEqual({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });

  it("get returns default screen dimensions", () => {
    const scr = Dimensions.get("screen");
    expect(scr).toEqual({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });

  it("set updates dimensions", () => {
    Dimensions.set({ window: { width: 768, height: 1024 } });
    const win = Dimensions.get("window");
    expect(win.width).toBe(768);
    expect(win.height).toBe(1024);
  });

  it("set notifies change listeners", () => {
    const handler = vi.fn();
    Dimensions.addEventListener("change", handler);
    Dimensions.set({ window: { width: 500 } });
    expect(handler).toHaveBeenCalledOnce();
    const arg = handler.mock.calls[0][0];
    expect(arg.window.width).toBe(500);
  });

  it("subscription remove stops notifications", () => {
    const handler = vi.fn();
    const sub = Dimensions.addEventListener("change", handler);
    sub.remove();
    Dimensions.set({ window: { width: 500 } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("set preserves unmodified fields", () => {
    Dimensions.set({ window: { width: 768 } });
    const win = Dimensions.get("window");
    expect(win.height).toBe(844); // unchanged
    expect(win.scale).toBe(3); // unchanged
  });

  it("_reset restores defaults", () => {
    Dimensions.set({ window: { width: 100 } });
    (Dimensions as any)._reset();
    expect(Dimensions.get("window").width).toBe(390);
  });

  it("get returns a copy (not a reference)", () => {
    const a = Dimensions.get("window");
    const b = Dimensions.get("window");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Responsive layout — Dimensions + PixelRatio working together
// ---------------------------------------------------------------------------

describe("Responsive layout integration", () => {
  beforeEach(() => {
    (Dimensions as any)._reset();
  });

  it("PixelRatio reads scale from Dimensions", () => {
    expect(PixelRatio.get()).toBe(3);
    expect(PixelRatio.getFontScale()).toBe(1);
  });

  it("PixelRatio updates when Dimensions change", () => {
    Dimensions.set({ window: { scale: 2, fontScale: 1.5 } });
    expect(PixelRatio.get()).toBe(2);
    expect(PixelRatio.getFontScale()).toBe(1.5);
  });

  it("getPixelSizeForLayoutSize uses current scale", () => {
    expect(PixelRatio.getPixelSizeForLayoutSize(10)).toBe(30); // 10 * 3
    Dimensions.set({ window: { scale: 2 } });
    expect(PixelRatio.getPixelSizeForLayoutSize(10)).toBe(20); // 10 * 2
  });

  it("roundToNearestPixel uses current scale", () => {
    // scale=3: round(1.4 * 3) / 3 = round(4.2) / 3 = 4/3 ≈ 1.333
    expect(PixelRatio.roundToNearestPixel(1.4)).toBeCloseTo(4 / 3);
  });
});

// ---------------------------------------------------------------------------
// Dark mode — Appearance + useColorScheme + component rendering
// ---------------------------------------------------------------------------

describe("Dark mode integration", () => {
  beforeEach(() => {
    (Appearance as any)._reset();
  });

  function ThemedScreen() {
    const scheme = useColorScheme();
    return (
      <View
        testID="screen"
        style={{ backgroundColor: scheme === "dark" ? "#000" : "#fff" }}
      >
        <Text testID="theme">{scheme}</Text>
      </View>
    );
  }

  it("renders light theme by default", () => {
    render(<ThemedScreen />);
    expect(screen.getByTestId("theme").props.children).toBe("light");
    expect(screen.getByTestId("screen").props.style).toEqual({
      backgroundColor: "#fff",
    });
  });

  it("Appearance.getColorScheme matches useColorScheme", () => {
    render(<ThemedScreen />);
    expect(screen.getByTestId("theme").props.children).toBe(
      Appearance.getColorScheme(),
    );
  });
});

// ---------------------------------------------------------------------------
// Animated + StyleSheet integration
// ---------------------------------------------------------------------------

describe("Animated + StyleSheet integration", () => {
  it("Animated.Value works with StyleSheet.flatten", () => {
    const opacity = new Animated.Value(0.5);
    const styles = StyleSheet.create({
      container: { opacity: 1, flex: 1 },
    });
    const flattened = StyleSheet.flatten([styles.container, { opacity }]);
    expect(flattened).toEqual({ opacity, flex: 1 });
  });

  it("timing animation sets value that can be read back", () => {
    const val = new Animated.Value(0);
    Animated.timing(val, { toValue: 100, useNativeDriver: false }).start();
    expect(val.getValue()).toBe(100);
  });

  it("spring animation with listener tracks value", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    Animated.spring(val, { toValue: 50, useNativeDriver: false }).start();
    expect(listener).toHaveBeenCalledWith({ value: 50 });
    expect(val.getValue()).toBe(50);
  });

  it("Animated.ValueXY tracks both axes", () => {
    const xy = new Animated.ValueXY({ x: 0, y: 0 });
    Animated.timing(xy.x, { toValue: 100, useNativeDriver: false }).start();
    Animated.timing(xy.y, { toValue: 200, useNativeDriver: false }).start();
    expect(xy.x.getValue()).toBe(100);
    expect(xy.y.getValue()).toBe(200);
    expect(xy.getLayout()).toEqual({ left: xy.x, top: xy.y });
  });
});

// ---------------------------------------------------------------------------
// Form component — TextInput + Keyboard + state
// ---------------------------------------------------------------------------

describe("Form handling integration", () => {
  beforeEach(() => {
    (Keyboard as any)._reset();
  });

  function SimpleForm() {
    const [text, setText] = useState("");
    const [submitted, setSubmitted] = useState(false);
    return (
      <View>
        <TextInput
          testID="input"
          value={text}
          onChangeText={setText}
          placeholder="Enter text"
        />
        <Pressable
          testID="submit"
          onPress={() => {
            setSubmitted(true);
            Keyboard.dismiss();
          }}
        >
          <Text>Submit</Text>
        </Pressable>
        {submitted && <Text testID="result">{text}</Text>}
      </View>
    );
  }

  it("renders input with placeholder", () => {
    render(<SimpleForm />);
    expect(screen.getByPlaceholderText("Enter text")).toBeTruthy();
  });

  it("handles text input change", () => {
    render(<SimpleForm />);
    fireEvent.changeText(screen.getByTestId("input"), "hello");
    fireEvent.press(screen.getByTestId("submit"));
    expect(screen.getByTestId("result").props.children).toBe("hello");
  });

  it("Keyboard.dismiss is called on submit", () => {
    render(<SimpleForm />);
    fireEvent.press(screen.getByTestId("submit"));
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FlatList with dynamic data
// ---------------------------------------------------------------------------

describe("FlatList dynamic data integration", () => {
  function TodoList() {
    const [items, setItems] = useState(["Buy milk", "Walk dog"]);
    return (
      <View>
        <Pressable
          testID="add"
          onPress={() => setItems([...items, `Item ${items.length + 1}`])}
        >
          <Text>Add</Text>
        </Pressable>
        <FlatList
          data={items}
          renderItem={({ item }: any) => <Text>{item}</Text>}
          keyExtractor={(item: string, i: number) => `${i}-${item}`}
          ListEmptyComponent={() => <Text testID="empty">No todos</Text>}
        />
      </View>
    );
  }

  it("renders initial items", () => {
    render(<TodoList />);
    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("Walk dog")).toBeTruthy();
  });

  it("adds item on button press", () => {
    render(<TodoList />);
    fireEvent.press(screen.getByTestId("add"));
    expect(screen.getByText("Item 3")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Platform-specific rendering
// ---------------------------------------------------------------------------

describe("Platform-specific rendering", () => {
  it("Platform.OS defaults to ios", () => {
    expect(Platform.OS).toBe("ios");
  });

  it("Platform.select picks ios value", () => {
    const result = Platform.select({ ios: "I am iOS", android: "I am Android" });
    expect(result).toBe("I am iOS");
  });

  it("Platform.Version is a string on iOS", () => {
    // iOS returns string version (e.g. "17.0"), Android returns number
    expect(typeof Platform.Version).toBe("string");
  });

  it("Platform.isPad/isTVOS are booleans", () => {
    expect(typeof Platform.isPad).toBe("boolean");
    expect(typeof Platform.isTV).toBe("boolean");
  });

  it("Platform.constants has correct structure", () => {
    expect(Platform.constants).toBeDefined();
    expect(typeof Platform.constants.reactNativeVersion).toBe("object");
    expect(Platform.constants.reactNativeVersion.major).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LayoutAnimation constants
// ---------------------------------------------------------------------------

describe("LayoutAnimation constants (conformance)", () => {
  it("Types has all animation types", () => {
    expect(LayoutAnimation.Types).toEqual({
      spring: "spring",
      linear: "linear",
      easeInEaseOut: "easeInEaseOut",
      easeIn: "easeIn",
      easeOut: "easeOut",
    });
  });

  it("Properties has all animatable properties", () => {
    expect(LayoutAnimation.Properties).toEqual({
      opacity: "opacity",
      scaleX: "scaleX",
      scaleY: "scaleY",
      scaleXY: "scaleXY",
    });
  });

  it("Presets.easeInEaseOut has correct structure", () => {
    expect(LayoutAnimation.Presets.easeInEaseOut).toEqual({
      duration: 300,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
  });

  it("Presets.spring has springDamping", () => {
    expect(LayoutAnimation.Presets.spring.update.springDamping).toBe(0.4);
  });

  it("create returns layout config", () => {
    const config = LayoutAnimation.create(500, "linear", "opacity");
    expect(config).toBeDefined();
    expect(config.duration).toBe(300); // mock returns fixed value
  });

  it("configureNext is callable", () => {
    expect(() =>
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ToastAndroid constants
// ---------------------------------------------------------------------------

describe("ToastAndroid (conformance)", () => {
  it("has duration constants", () => {
    expect(ToastAndroid.SHORT).toBe(0);
    expect(ToastAndroid.LONG).toBe(1);
  });

  it("has gravity constants", () => {
    expect(ToastAndroid.TOP).toBe(0);
    expect(ToastAndroid.BOTTOM).toBe(1);
    expect(ToastAndroid.CENTER).toBe(2);
  });

  it("show is callable", () => {
    expect(() => ToastAndroid.show("Hello", ToastAndroid.SHORT)).not.toThrow();
  });

  it("showWithGravity is callable", () => {
    expect(() =>
      ToastAndroid.showWithGravity("Hello", ToastAndroid.SHORT, ToastAndroid.BOTTOM),
    ).not.toThrow();
  });

  it("showWithGravityAndOffset is callable", () => {
    expect(() =>
      ToastAndroid.showWithGravityAndOffset(
        "Hello",
        ToastAndroid.SHORT,
        ToastAndroid.BOTTOM,
        0,
        0,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

describe("Alert (conformance)", () => {
  it("alert is callable with title only", () => {
    expect(() => Alert.alert("Title")).not.toThrow();
  });

  it("alert is callable with title and message", () => {
    expect(() => Alert.alert("Title", "Message")).not.toThrow();
  });

  it("alert is callable with buttons", () => {
    const buttons = [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: vi.fn() },
    ];
    expect(() => Alert.alert("Title", "Msg", buttons as any)).not.toThrow();
  });

  it("prompt is callable", () => {
    expect(() => Alert.prompt("Title", "Message", vi.fn())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AccessibilityInfo
// ---------------------------------------------------------------------------

describe("AccessibilityInfo (conformance)", () => {
  it("isScreenReaderEnabled resolves to false", async () => {
    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(false);
  });

  it("isReduceMotionEnabled resolves to false", async () => {
    expect(await AccessibilityInfo.isReduceMotionEnabled()).toBe(false);
  });

  it("getRecommendedTimeoutMillis returns the original timeout", async () => {
    expect(await AccessibilityInfo.getRecommendedTimeoutMillis(3000)).toBe(3000);
  });

  it("announceForAccessibility is callable", () => {
    expect(() =>
      AccessibilityInfo.announceForAccessibility("Hello"),
    ).not.toThrow();
  });

  it("addEventListener returns subscription", () => {
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", vi.fn());
    expect(typeof sub.remove).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// LogBox
// ---------------------------------------------------------------------------

describe("LogBox (conformance)", () => {
  it("ignoreLogs accepts array of patterns", () => {
    expect(() => LogBox.ignoreLogs(["Warning:"])).not.toThrow();
  });

  it("ignoreAllLogs is callable", () => {
    expect(() => LogBox.ignoreAllLogs()).not.toThrow();
  });

  it("install/uninstall are callable", () => {
    expect(() => LogBox.install()).not.toThrow();
    expect(() => LogBox.uninstall()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Vibration
// ---------------------------------------------------------------------------

describe("Vibration (conformance)", () => {
  it("vibrate is callable with no args", () => {
    expect(() => Vibration.vibrate()).not.toThrow();
  });

  it("vibrate is callable with pattern", () => {
    expect(() => Vibration.vibrate([100, 200, 300])).not.toThrow();
  });

  it("cancel is callable", () => {
    expect(() => Vibration.cancel()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AppState → component integration
// ---------------------------------------------------------------------------

describe("AppState component integration", () => {
  beforeEach(() => {
    (AppState as any)._reset();
  });

  function AppStateDisplay() {
    const [state, setState] = useState(AppState.currentState);
    useEffect(() => {
      const sub = AppState.addEventListener("change", (s: string) => setState(s));
      return () => sub.remove();
    }, []);
    return <Text testID="state">{state}</Text>;
  }

  it("renders initial active state", () => {
    render(<AppStateDisplay />);
    expect(screen.getByTestId("state").props.children).toBe("active");
  });

  it("updates when AppState changes", () => {
    render(<AppStateDisplay />);
    act(() => {
      (AppState as any)._setState("background");
    });
    expect(screen.getByTestId("state").props.children).toBe("background");
  });
});

// ---------------------------------------------------------------------------
// Keyboard visibility in component
// ---------------------------------------------------------------------------

describe("Keyboard component integration", () => {
  beforeEach(() => {
    (Keyboard as any)._reset();
  });

  function KeyboardStatus() {
    const [visible, setVisible] = useState(false);
    const [height, setHeight] = useState(0);
    useEffect(() => {
      const showSub = Keyboard.addListener("keyboardDidShow", (e: any) => {
        setVisible(true);
        setHeight(e.endCoordinates.height);
      });
      const hideSub = Keyboard.addListener("keyboardDidHide", () => {
        setVisible(false);
        setHeight(0);
      });
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);
    return (
      <View>
        <Text testID="visible">{String(visible)}</Text>
        <Text testID="height">{String(height)}</Text>
      </View>
    );
  }

  it("starts with keyboard hidden", () => {
    render(<KeyboardStatus />);
    expect(screen.getByTestId("visible").props.children).toBe("false");
    expect(screen.getByTestId("height").props.children).toBe("0");
  });

  it("shows keyboard with correct height", () => {
    render(<KeyboardStatus />);
    act(() => {
      (Keyboard as any)._show(300);
    });
    expect(screen.getByTestId("visible").props.children).toBe("true");
    expect(screen.getByTestId("height").props.children).toBe("300");
  });

  it("hides keyboard", () => {
    render(<KeyboardStatus />);
    act(() => {
      (Keyboard as any)._show(300);
    });
    act(() => {
      (Keyboard as any)._hide();
    });
    expect(screen.getByTestId("visible").props.children).toBe("false");
    expect(screen.getByTestId("height").props.children).toBe("0");
  });
});
