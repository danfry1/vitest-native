import { vi } from "vitest";

export function createLayoutAnimationMock() {
  // Declared before the object so the preset shortcuts below can bind to the same spy
  // a test asserts on: `LayoutAnimation.easeInEaseOut()` must register as a
  // `configureNext` call, exactly as it does in React Native, where the shortcuts are
  // `configureNext.bind(null, Presets.x)`.
  const configureNext = vi.fn();

  const presets = {
    easeInEaseOut: {
      duration: 300,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    },
    linear: {
      duration: 500,
      create: { type: "linear", property: "opacity" },
      update: { type: "linear" },
      delete: { type: "linear", property: "opacity" },
    },
    spring: {
      duration: 700,
      create: { type: "linear", property: "opacity" },
      update: { type: "spring", springDamping: 0.4 },
      delete: { type: "linear", property: "opacity" },
    },
  };

  return {
    configureNext,
    create: vi.fn(() => ({
      duration: 300,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    })),
    Types: {
      spring: "spring",
      linear: "linear",
      easeInEaseOut: "easeInEaseOut",
      easeIn: "easeIn",
      easeOut: "easeOut",
    },
    Properties: {
      opacity: "opacity",
      scaleX: "scaleX",
      scaleY: "scaleY",
      scaleXY: "scaleXY",
    },
    Presets: presets,
    // React Native binds these to configureNext with the matching preset. They were
    // missing entirely, so `LayoutAnimation.easeInEaseOut()` — the idiomatic one-liner —
    // threw "is not a function" under this engine while working under the native one.
    easeInEaseOut: (onAnimationDidEnd?: () => void) =>
      configureNext(presets.easeInEaseOut, onAnimationDidEnd),
    linear: (onAnimationDidEnd?: () => void) => configureNext(presets.linear, onAnimationDidEnd),
    spring: (onAnimationDidEnd?: () => void) => configureNext(presets.spring, onAnimationDidEnd),
    // Disabled in React Native itself; it logs and does nothing.
    checkConfig: vi.fn(() => {
      console.error("LayoutAnimation.checkConfig(...) has been disabled.");
    }),
    setEnabled: vi.fn(),
  };
}
