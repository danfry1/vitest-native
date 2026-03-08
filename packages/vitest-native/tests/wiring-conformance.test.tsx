/**
 * Wiring conformance tests — verifies that APIs are properly connected
 * to their corresponding hooks and that Animated composition actually
 * runs child animations. These test the cross-API integration that
 * real apps depend on.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import {
  View,
  Text,
  Animated,
  Appearance,
  Dimensions,
  useColorScheme,
  useWindowDimensions,
} from "react-native";

// ---------------------------------------------------------------------------
// Appearance → useColorScheme wiring
// ---------------------------------------------------------------------------

describe("Appearance → useColorScheme wiring (conformance)", () => {
  beforeEach(() => {
    (Appearance as any)._reset();
  });

  function ThemeDisplay() {
    const scheme = useColorScheme();
    return <Text testID="scheme">{scheme}</Text>;
  }

  it("useColorScheme reflects Appearance default", () => {
    render(<ThemeDisplay />);
    expect(screen.getByTestId("scheme").props.children).toBe("light");
    expect(Appearance.getColorScheme()).toBe("light");
  });

  it("Appearance.setColorScheme propagates to useColorScheme", () => {
    render(<ThemeDisplay />);
    act(() => {
      Appearance.setColorScheme("dark");
    });
    expect(screen.getByTestId("scheme").props.children).toBe("dark");
  });

  it("Appearance.setColorScheme back to light propagates", () => {
    render(<ThemeDisplay />);
    act(() => {
      Appearance.setColorScheme("dark");
    });
    act(() => {
      Appearance.setColorScheme("light");
    });
    expect(screen.getByTestId("scheme").props.children).toBe("light");
  });

  it("Appearance change listeners still fire", () => {
    const listener = vi.fn();
    Appearance.addChangeListener(listener);
    act(() => {
      Appearance.setColorScheme("dark");
    });
    expect(listener).toHaveBeenCalledWith({ colorScheme: "dark" });
  });

  it("multiple components all update on scheme change", () => {
    function ThemeA() {
      const s = useColorScheme();
      return <Text testID="a">{s}</Text>;
    }
    function ThemeB() {
      const s = useColorScheme();
      return <Text testID="b">{s}</Text>;
    }
    render(
      <View>
        <ThemeA />
        <ThemeB />
      </View>,
    );
    act(() => {
      Appearance.setColorScheme("dark");
    });
    expect(screen.getByTestId("a").props.children).toBe("dark");
    expect(screen.getByTestId("b").props.children).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Dimensions → useWindowDimensions wiring
// ---------------------------------------------------------------------------

describe("Dimensions → useWindowDimensions wiring (conformance)", () => {
  beforeEach(() => {
    (Dimensions as any)._reset();
  });

  function DimensionsDisplay() {
    const { width, height } = useWindowDimensions();
    return (
      <View>
        <Text testID="w">{String(width)}</Text>
        <Text testID="h">{String(height)}</Text>
      </View>
    );
  }

  it("useWindowDimensions reflects Dimensions defaults", () => {
    render(<DimensionsDisplay />);
    expect(screen.getByTestId("w").props.children).toBe("390");
    expect(screen.getByTestId("h").props.children).toBe("844");
  });

  it("Dimensions.set propagates to useWindowDimensions", () => {
    render(<DimensionsDisplay />);
    act(() => {
      Dimensions.set({ window: { width: 768, height: 1024 } });
    });
    expect(screen.getByTestId("w").props.children).toBe("768");
    expect(screen.getByTestId("h").props.children).toBe("1024");
  });

  it("Dimensions change listeners still fire", () => {
    const listener = vi.fn();
    Dimensions.addEventListener("change", listener);
    act(() => {
      Dimensions.set({ window: { width: 500 } });
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("Dimensions.get reflects the updated values", () => {
    act(() => {
      Dimensions.set({ window: { width: 500, height: 600 } });
    });
    const win = Dimensions.get("window");
    expect(win.width).toBe(500);
    expect(win.height).toBe(600);
  });

  it("responsive component updates on dimension change", () => {
    function ResponsiveLayout() {
      const { width } = useWindowDimensions();
      const layout = width >= 768 ? "tablet" : "phone";
      return <Text testID="layout">{layout}</Text>;
    }
    render(<ResponsiveLayout />);
    expect(screen.getByTestId("layout").props.children).toBe("phone");
    act(() => {
      Dimensions.set({ window: { width: 1024, height: 768 } });
    });
    expect(screen.getByTestId("layout").props.children).toBe("tablet");
  });
});

// ---------------------------------------------------------------------------
// Animated.sequence runs child animations
// ---------------------------------------------------------------------------

describe("Animated.sequence composition (conformance)", () => {
  it("sequence runs all child animations", () => {
    const val = new Animated.Value(0);
    Animated.sequence([
      Animated.timing(val, { toValue: 50, useNativeDriver: false }),
      Animated.timing(val, { toValue: 100, useNativeDriver: false }),
    ]).start();
    // Last animation should win
    expect(val.getValue()).toBe(100);
  });

  it("sequence with single animation sets value", () => {
    const val = new Animated.Value(0);
    Animated.sequence([
      Animated.timing(val, { toValue: 42, useNativeDriver: false }),
    ]).start();
    expect(val.getValue()).toBe(42);
  });

  it("sequence callback fires with finished:true", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.sequence([
      Animated.timing(val, { toValue: 1, useNativeDriver: false }),
    ]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("sequence with spring also sets value", () => {
    const val = new Animated.Value(0);
    Animated.sequence([
      Animated.timing(val, { toValue: 50, useNativeDriver: false }),
      Animated.spring(val, { toValue: 100, useNativeDriver: false }),
    ]).start();
    expect(val.getValue()).toBe(100);
  });

  it("sequence triggers listeners", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    Animated.sequence([
      Animated.timing(val, { toValue: 1, useNativeDriver: false }),
      Animated.timing(val, { toValue: 2, useNativeDriver: false }),
    ]).start();
    expect(listener).toHaveBeenCalledWith({ value: 1 });
    expect(listener).toHaveBeenCalledWith({ value: 2 });
  });
});

// ---------------------------------------------------------------------------
// Animated.parallel runs child animations
// ---------------------------------------------------------------------------

describe("Animated.parallel composition (conformance)", () => {
  it("parallel runs all child animations", () => {
    const a = new Animated.Value(0);
    const b = new Animated.Value(0);
    Animated.parallel([
      Animated.timing(a, { toValue: 100, useNativeDriver: false }),
      Animated.timing(b, { toValue: 200, useNativeDriver: false }),
    ]).start();
    expect(a.getValue()).toBe(100);
    expect(b.getValue()).toBe(200);
  });

  it("parallel callback fires with finished:true", () => {
    const cb = vi.fn();
    const a = new Animated.Value(0);
    Animated.parallel([
      Animated.timing(a, { toValue: 1, useNativeDriver: false }),
    ]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("parallel with multiple values sets all", () => {
    const x = new Animated.Value(0);
    const y = new Animated.Value(0);
    const opacity = new Animated.Value(0);
    Animated.parallel([
      Animated.timing(x, { toValue: 100, useNativeDriver: false }),
      Animated.timing(y, { toValue: 200, useNativeDriver: false }),
      Animated.spring(opacity, { toValue: 1, useNativeDriver: false }),
    ]).start();
    expect(x.getValue()).toBe(100);
    expect(y.getValue()).toBe(200);
    expect(opacity.getValue()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Animated.stagger runs child animations
// ---------------------------------------------------------------------------

describe("Animated.stagger composition (conformance)", () => {
  it("stagger runs all child animations", () => {
    const a = new Animated.Value(0);
    const b = new Animated.Value(0);
    Animated.stagger(100, [
      Animated.timing(a, { toValue: 1, useNativeDriver: false }),
      Animated.timing(b, { toValue: 2, useNativeDriver: false }),
    ]).start();
    expect(a.getValue()).toBe(1);
    expect(b.getValue()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Realistic animated pattern: fade-in slide-up
// ---------------------------------------------------------------------------

describe("Realistic animation patterns", () => {
  it("fade-in + slide-up parallel animation", () => {
    const opacity = new Animated.Value(0);
    const translateY = new Animated.Value(50);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    expect(opacity.getValue()).toBe(1);
    expect(translateY.getValue()).toBe(0);
  });

  it("sequential animation: grow then fade", () => {
    const scale = new Animated.Value(0);
    const opacity = new Animated.Value(0);

    Animated.sequence([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    expect(scale.getValue()).toBe(1);
    expect(opacity.getValue()).toBe(1);
  });

  it("staggered list items", () => {
    const items = [0, 1, 2, 3, 4].map(() => new Animated.Value(0));
    Animated.stagger(
      50,
      items.map((val) =>
        Animated.timing(val, { toValue: 1, duration: 200, useNativeDriver: true }),
      ),
    ).start();

    items.forEach((val) => {
      expect(val.getValue()).toBe(1);
    });
  });
});
