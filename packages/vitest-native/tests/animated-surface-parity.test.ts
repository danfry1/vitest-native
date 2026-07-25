/**
 * The members the mock was missing relative to real React Native.
 *
 * A behavioural probe cannot catch an absent member — nothing exercises it, so nothing
 * diverges. These were found by diffing the mock's member list against real React
 * Native's under both engines, which is now a cross-check probe (`animated-surface`).
 * Valid React Native code calling any of them used to throw under the mock engine while
 * working under the native one.
 */
import { describe, expect, it, vi } from "vitest";
import { Animated } from "react-native";

describe("classes React Native exports for type checking", () => {
  it("exposes Node, Interpolation and Event", () => {
    const api = Animated as unknown as Record<string, unknown>;
    for (const name of ["Node", "Interpolation", "Event"]) {
      expect(typeof api[name], name).toBe("function");
    }
  });

  it("makes values and interpolations instanceof Animated.Node", () => {
    const api = Animated as unknown as { Node: Function; Interpolation: Function };
    const value = new Animated.Value(1);
    const interpolated = value.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
    expect(value).toBeInstanceOf(api.Node);
    expect(interpolated).toBeInstanceOf(api.Node);
    expect(interpolated).toBeInstanceOf(api.Interpolation);
  });
});

describe("attachNativeEvent", () => {
  it("returns a detachable handle without a native side", () => {
    const attach = (Animated as unknown as { attachNativeEvent: Function }).attachNativeEvent;
    const handle = attach({}, "onScroll", [{ nativeEvent: { contentOffset: { y: null } } }]);
    expect(typeof handle.detach).toBe("function");
    expect(() => handle.detach()).not.toThrow();
  });
});

describe("hasListeners", () => {
  it("tracks listeners on a value", () => {
    const value = new Animated.Value(0) as unknown as {
      hasListeners(): boolean;
      addListener(cb: Function): string;
      removeListener(id: string): void;
    };
    expect(value.hasListeners()).toBe(false);
    const id = value.addListener(() => {});
    expect(value.hasListeners()).toBe(true);
    value.removeListener(id);
    expect(value.hasListeners()).toBe(false);
  });

  it("reports either axis for a ValueXY", () => {
    const xy = new Animated.ValueXY({ x: 0, y: 0 }) as unknown as {
      hasListeners(): boolean;
      x: { addListener(cb: Function): string };
    };
    expect(xy.hasListeners()).toBe(false);
    xy.x.addListener(() => {});
    expect(xy.hasListeners()).toBe(true);
  });
});

describe("toJSON", () => {
  it("returns the current value for a node and both axes for a ValueXY", () => {
    const value = new Animated.Value(7) as unknown as { toJSON(): unknown };
    expect(value.toJSON()).toBe(7);
    const xy = new Animated.ValueXY({ x: 1, y: 2 }) as unknown as { toJSON(): unknown };
    expect(xy.toJSON()).toEqual({ x: 1, y: 2 });
  });
});

describe("track / stopTracking / animate", () => {
  it("track kicks the tracking node immediately, as React Native does", () => {
    const value = new Animated.Value(0) as unknown as {
      track(t: unknown): void;
      stopTracking(): void;
    };
    const update = vi.fn();
    const detach = vi.fn();
    value.track({ update, __detach: detach });
    expect(update).toHaveBeenCalledTimes(1);

    // Tracking again replaces the previous node, detaching it first.
    value.track({ update: vi.fn(), __detach: vi.fn() });
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("stopTracking detaches and is safe to call twice", () => {
    const value = new Animated.Value(0) as unknown as {
      track(t: unknown): void;
      stopTracking(): void;
    };
    const detach = vi.fn();
    value.track({ update: vi.fn(), __detach: detach });
    value.stopTracking();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(() => value.stopTracking()).not.toThrow();
  });

  it("animate drives the value and reports completion", () => {
    const value = new Animated.Value(0) as unknown as {
      animate(a: unknown, cb?: Function): void;
      __getValue(): number;
    };
    const done = vi.fn();
    value.animate(
      {
        start: (_from: number, onUpdate: (v: number) => void, onEnd: (r: unknown) => void) => {
          onUpdate(42);
          onEnd({ finished: true });
        },
      },
      done,
    );
    expect(value.__getValue()).toBe(42);
    expect(done).toHaveBeenCalledWith({ finished: true });
  });

  it("animate stops a previous animation before starting the next", () => {
    const value = new Animated.Value(0) as unknown as { animate(a: unknown): void };
    const stop = vi.fn();
    value.animate({ start: () => {}, stop });
    value.animate({ start: () => {}, stop: vi.fn() });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("animation controls sit where React Native puts them", () => {
  it("are on Value and Color but NOT on an interpolation", () => {
    const value = new Animated.Value(0) as unknown as Record<string, unknown>;
    const color = new (Animated as unknown as { Color: new (v: string) => unknown }).Color(
      "red",
    ) as Record<string, unknown>;
    const interpolated = new Animated.Value(0).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }) as unknown as Record<string, unknown>;

    for (const name of ["stopAnimation", "resetAnimation"]) {
      expect(typeof value[name], `Value.${name}`).toBe("function");
      expect(typeof color[name], `Color.${name}`).toBe("function");
      // An interpolation is derived and cannot be animated directly; real React Native
      // does not give it these, and putting them on the shared base class did.
      expect(interpolated[name], `Interpolation.${name}`).toBeUndefined();
    }
  });
});

describe("getValue", () => {
  it("still works but warns, since real React Native has no such method", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const value = new Animated.Value(3) as unknown as { getValue(): number };
      expect(value.getValue()).toBe(3);
      // Warned at most once per process, so this asserts the message rather than a count:
      // another test may already have triggered it.
      const warned = warn.mock.calls.flat().join(" ");
      if (warn.mock.calls.length > 0) {
        expect(warned).toContain("__getValue()");
      }
    } finally {
      warn.mockRestore();
    }
  });
});
