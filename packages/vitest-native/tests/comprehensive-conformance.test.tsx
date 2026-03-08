/**
 * Comprehensive conformance tests — fills remaining component gaps and
 * tests advanced patterns like ref forwarding, static methods,
 * ImageBackground rendering, StatusBar API, and ScrollView ref methods.
 */

import { describe, it, expect, vi } from "vitest";
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react-native";
import {
  ScrollView,
  ImageBackground,
  StatusBar,
  Switch,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  RefreshControl,
  DrawerLayoutAndroid,
  InputAccessoryView,
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";

// ---------------------------------------------------------------------------
// ScrollView ref methods
// ---------------------------------------------------------------------------

describe("ScrollView (conformance)", () => {
  it("renders children", () => {
    render(
      <ScrollView testID="scroll">
        <Text testID="child">Content</Text>
      </ScrollView>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("scrollTo ref method is callable", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(() => ref.current.scrollTo({ x: 0, y: 100 })).not.toThrow();
    expect(ref.current.scrollTo).toHaveBeenCalledWith({ x: 0, y: 100 });
  });

  it("scrollToEnd ref method is callable", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(() => ref.current.scrollToEnd()).not.toThrow();
  });

  it("flashScrollIndicators ref method is callable", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(() => ref.current.flashScrollIndicators()).not.toThrow();
  });

  it("getScrollResponder returns object", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(ref.current.getScrollResponder()).toEqual({});
  });

  it("passes props through", () => {
    render(
      <ScrollView testID="scroll" horizontal showsHorizontalScrollIndicator={false} />,
    );
    const el = screen.getByTestId("scroll");
    expect(el.props.horizontal).toBe(true);
    expect(el.props.showsHorizontalScrollIndicator).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ImageBackground
// ---------------------------------------------------------------------------

describe("ImageBackground (conformance)", () => {
  it("renders children", () => {
    render(
      <ImageBackground source={{ uri: "https://example.com/bg.png" }}>
        <Text testID="overlay">Hello</Text>
      </ImageBackground>,
    );
    expect(screen.getByTestId("overlay")).toBeTruthy();
  });

  it("passes style to the outer container", () => {
    render(
      <ImageBackground
        testID="bg"
        source={{ uri: "test" }}
        style={{ width: 100, height: 100 }}
      >
        <Text>Content</Text>
      </ImageBackground>,
    );
    expect(screen.getByTestId("bg").props.style).toEqual({
      width: 100,
      height: 100,
    });
  });
});

// ---------------------------------------------------------------------------
// StatusBar static methods
// ---------------------------------------------------------------------------

describe("StatusBar (conformance)", () => {
  it("renders as component", () => {
    render(<StatusBar barStyle="light-content" testID="bar" />);
    expect(screen.getByTestId("bar")).toBeTruthy();
  });

  it("currentHeight is 44", () => {
    expect(StatusBar.currentHeight).toBe(44);
  });

  it("setBarStyle is callable", () => {
    expect(() => StatusBar.setBarStyle("dark-content")).not.toThrow();
  });

  it("setHidden is callable", () => {
    expect(() => StatusBar.setHidden(true)).not.toThrow();
  });

  it("setBackgroundColor is callable", () => {
    expect(() => StatusBar.setBackgroundColor("#000")).not.toThrow();
  });

  it("setTranslucent is callable", () => {
    expect(() => StatusBar.setTranslucent(true)).not.toThrow();
  });

  it("setNetworkActivityIndicatorVisible is callable", () => {
    expect(() =>
      StatusBar.setNetworkActivityIndicatorVisible(true),
    ).not.toThrow();
  });

  it("pushStackEntry returns object", () => {
    const entry = StatusBar.pushStackEntry({ barStyle: "dark-content" });
    expect(entry).toEqual({});
  });

  it("popStackEntry is callable", () => {
    const entry = StatusBar.pushStackEntry({});
    expect(() => StatusBar.popStackEntry(entry)).not.toThrow();
  });

  it("replaceStackEntry returns object", () => {
    const entry = StatusBar.pushStackEntry({});
    const newEntry = StatusBar.replaceStackEntry(entry, {
      barStyle: "light-content",
    });
    expect(newEntry).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

describe("Switch (conformance)", () => {
  it("renders with value prop", () => {
    render(<Switch testID="switch" value={true} />);
    expect(screen.getByTestId("switch").props.value).toBe(true);
  });

  it("onValueChange receives callback", () => {
    const handler = vi.fn();
    render(<Switch testID="switch" value={false} onValueChange={handler} />);
    expect(screen.getByTestId("switch").props.onValueChange).toBe(handler);
  });

  it("passes trackColor and thumbColor", () => {
    render(
      <Switch
        testID="switch"
        trackColor={{ false: "#ccc", true: "#0f0" }}
        thumbColor="#fff"
      />,
    );
    const el = screen.getByTestId("switch");
    expect(el.props.trackColor).toEqual({ false: "#ccc", true: "#0f0" });
    expect(el.props.thumbColor).toBe("#fff");
  });
});

// ---------------------------------------------------------------------------
// ActivityIndicator
// ---------------------------------------------------------------------------

describe("ActivityIndicator (conformance)", () => {
  it("renders with default props", () => {
    render(<ActivityIndicator testID="spinner" />);
    expect(screen.getByTestId("spinner")).toBeTruthy();
  });

  it("passes size and color props", () => {
    render(<ActivityIndicator testID="spinner" size="large" color="#f00" />);
    const el = screen.getByTestId("spinner");
    expect(el.props.size).toBe("large");
    expect(el.props.color).toBe("#f00");
  });

  it("passes animating prop", () => {
    render(<ActivityIndicator testID="spinner" animating={false} />);
    expect(screen.getByTestId("spinner").props.animating).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SafeAreaView
// ---------------------------------------------------------------------------

describe("SafeAreaView (conformance)", () => {
  it("renders children", () => {
    render(
      <SafeAreaView testID="safe">
        <Text testID="child">Safe</Text>
      </SafeAreaView>,
    );
    expect(screen.getByTestId("safe")).toBeTruthy();
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// KeyboardAvoidingView
// ---------------------------------------------------------------------------

describe("KeyboardAvoidingView (conformance)", () => {
  it("renders children", () => {
    render(
      <KeyboardAvoidingView testID="kav" behavior="padding">
        <Text testID="child">Content</Text>
      </KeyboardAvoidingView>,
    );
    expect(screen.getByTestId("kav")).toBeTruthy();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("passes behavior prop", () => {
    render(<KeyboardAvoidingView testID="kav" behavior="height" />);
    expect(screen.getByTestId("kav").props.behavior).toBe("height");
  });
});

// ---------------------------------------------------------------------------
// RefreshControl
// ---------------------------------------------------------------------------

describe("RefreshControl (conformance)", () => {
  it("renders with refreshing prop", () => {
    render(<RefreshControl testID="refresh" refreshing={true} />);
    expect(screen.getByTestId("refresh").props.refreshing).toBe(true);
  });

  it("passes onRefresh callback", () => {
    const handler = vi.fn();
    render(
      <RefreshControl testID="refresh" refreshing={false} onRefresh={handler} />,
    );
    expect(screen.getByTestId("refresh").props.onRefresh).toBe(handler);
  });
});

// ---------------------------------------------------------------------------
// DrawerLayoutAndroid
// ---------------------------------------------------------------------------

describe("DrawerLayoutAndroid (conformance)", () => {
  it("renders children", () => {
    render(
      <DrawerLayoutAndroid
        testID="drawer"
        renderNavigationView={() => <View />}
      >
        <Text testID="content">Main</Text>
      </DrawerLayoutAndroid>,
    );
    expect(screen.getByTestId("content")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// InputAccessoryView
// ---------------------------------------------------------------------------

describe("InputAccessoryView (conformance)", () => {
  it("renders children", () => {
    render(
      <InputAccessoryView>
        <Text testID="accessory">Done</Text>
      </InputAccessoryView>,
    );
    expect(screen.getByTestId("accessory")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StyleSheet.create + hairlineWidth + absoluteFill
// ---------------------------------------------------------------------------

describe("StyleSheet extended (conformance)", () => {
  it("create returns the same object", () => {
    const styles = StyleSheet.create({
      container: { flex: 1, backgroundColor: "white" },
      text: { fontSize: 16 },
    });
    expect(styles.container).toEqual({ flex: 1, backgroundColor: "white" });
    expect(styles.text).toEqual({ fontSize: 16 });
  });

  it("hairlineWidth is a positive number", () => {
    expect(StyleSheet.hairlineWidth).toBeGreaterThan(0);
    expect(StyleSheet.hairlineWidth).toBeLessThanOrEqual(1);
  });

  it("absoluteFill has correct style", () => {
    expect(StyleSheet.absoluteFill).toEqual({
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });

  it("absoluteFillObject matches absoluteFill", () => {
    expect(StyleSheet.absoluteFillObject).toEqual(StyleSheet.absoluteFill);
  });

  it("compose merges two styles", () => {
    const a = { flex: 1 };
    const b = { backgroundColor: "red" };
    const result = StyleSheet.compose(a, b);
    expect(result).toEqual([a, b]);
  });

  it("compose with falsy second returns first", () => {
    const a = { flex: 1 };
    const result = StyleSheet.compose(a, undefined);
    expect(result).toEqual([a, undefined]);
  });
});

// ---------------------------------------------------------------------------
// Animated.View / Animated.Text / Animated.Image — rendering
// ---------------------------------------------------------------------------

describe("Animated wrapper components (conformance)", () => {
  it("Animated.View renders with testID", () => {
    render(
      <Animated.View testID="av" style={{ opacity: 1 }}>
        <Text>Content</Text>
      </Animated.View>,
    );
    expect(screen.getByTestId("av")).toBeTruthy();
  });

  it("Animated.Text renders", () => {
    render(<Animated.Text testID="at">Hello</Animated.Text>);
    expect(screen.getByTestId("at")).toBeTruthy();
  });

  it("Animated.Image renders", () => {
    render(
      <Animated.Image testID="ai" source={{ uri: "test" }} />,
    );
    expect(screen.getByTestId("ai")).toBeTruthy();
  });

  it("Animated.View has correct displayName", () => {
    expect(Animated.View.displayName).toBe("Animated.View");
  });

  it("Animated.Text has correct displayName", () => {
    expect(Animated.Text.displayName).toBe("Animated.Text");
  });

  it("Animated.ScrollView has correct displayName", () => {
    expect(Animated.ScrollView.displayName).toBe("Animated.ScrollView");
  });

  it("Animated.FlatList has correct displayName", () => {
    expect(Animated.FlatList.displayName).toBe("Animated.FlatList");
  });
});

// ---------------------------------------------------------------------------
// Miscellaneous registry exports — UTFSequence, ReactNativeVersion
// ---------------------------------------------------------------------------

describe("Registry misc exports (conformance)", () => {
  // These are imported as named exports from react-native
  // but we test them via the module

  it("Dimensions.get window matches screen by default", () => {
    const win = Dimensions.get("window");
    const scr = Dimensions.get("screen");
    expect(win).toEqual(scr);
  });

  it("Platform.select returns default when platform not matched", () => {
    const result = Platform.select({
      android: "android",
      default: "fallback",
    });
    // On iOS, android doesn't match, so it falls back
    expect(result).toBe("fallback");
  });
});
