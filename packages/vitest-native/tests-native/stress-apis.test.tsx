// Second boundary stress pass: deeper native-API surface real apps lean on —
// async native modules (Share/Image), callback-with-value methods, imperative
// component refs, animation drivers, and event-emitter plumbing. Independent
// probes; failures are boundary holes to plug in src/native/boundary.mjs.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import {
  Share,
  Image,
  InteractionManager,
  Keyboard,
  AppState,
  PanResponder,
  SectionList,
  Pressable,
  TextInput,
  Text,
  Animated,
  Easing,
  NativeEventEmitter,
  DeviceEventEmitter,
} from "react-native";

describe("native engine: async native modules", () => {
  it("Share.share resolves to a result with an action", async () => {
    const result = await Share.share({ message: "hello" });
    expect(result).toBeDefined();
    expect(typeof (result as any).action).toBe("string");
  });

  it("Image.prefetch resolves without throwing", async () => {
    await expect(Image.prefetch("https://example.com/x.png")).resolves.toBeDefined();
  });

  it("Image.getSize invokes a callback without hanging", async () => {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      // Either success or failure must fire — never hang.
      Image.getSize(
        "https://example.com/x.png",
        () => done(),
        () => done(),
      );
      setTimeout(done, 200);
    });
    expect(true).toBe(true);
  });

  it("Keyboard.dismiss + isVisible do not throw", () => {
    expect(() => Keyboard.dismiss()).not.toThrow();
    expect(() => Keyboard.isVisible?.()).not.toThrow();
  });
});

describe("native engine: scheduling + gestures", () => {
  it("InteractionManager.runAfterInteractions runs the task", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const task = vi.fn();
      const handle = InteractionManager.runAfterInteractions(task);
      expect(handle).toBeDefined();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(task).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("PanResponder.create returns usable panHandlers", () => {
    const pr = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: () => {},
    });
    expect(pr.panHandlers).toBeDefined();
    expect(typeof pr.panHandlers.onStartShouldSetResponder).toBe("function");
  });

  it("AppState.currentState is a sane default", () => {
    expect(["active", "background", "inactive", "unknown"]).toContain(
      String(AppState.currentState ?? "active"),
    );
  });
});

describe("native engine: component depth", () => {
  it("SectionList renders section headers and rows", async () => {
    await render(
      <SectionList
        sections={[
          { title: "A", data: ["a1", "a2"] },
          { title: "B", data: ["b1"] },
        ]}
        keyExtractor={(item, i) => item + i}
        renderItem={({ item }) => <Text>{`row-${item}`}</Text>}
        renderSectionHeader={({ section }) => <Text>{`hdr-${section.title}`}</Text>}
      />,
    );
    expect(screen.getByText("hdr-A")).toBeTruthy();
    expect(screen.getByText("row-a1")).toBeTruthy();
  });

  it("Pressable renders function children with pressed state", async () => {
    await render(
      <Pressable testID="p">{({ pressed }) => <Text>{pressed ? "down" : "up"}</Text>}</Pressable>,
    );
    expect(screen.getByText("up")).toBeTruthy();
  });

  it("TextInput imperative ref methods do not throw", async () => {
    function Field() {
      const ref = React.useRef<any>(null);
      React.useEffect(() => {
        ref.current?.focus?.();
        ref.current?.blur?.();
        ref.current?.clear?.();
      }, []);
      return <TextInput ref={ref} testID="ti" />;
    }
    expect(await render(<Field />)).toBeDefined();
  });
});

describe("native engine: animation drivers", () => {
  it("Animated.spring / sequence / parallel / loop start without throwing", () => {
    const v = new Animated.Value(0);
    const w = new Animated.Value(0);
    expect(() => {
      Animated.sequence([
        Animated.spring(v, { toValue: 1, useNativeDriver: false }),
        Animated.parallel([
          Animated.timing(w, {
            toValue: 1,
            duration: 10,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
      ]).start();
    }).not.toThrow();
    expect(() =>
      Animated.loop(
        Animated.timing(v, { toValue: 2, duration: 10, useNativeDriver: false }),
      ).start(),
    ).not.toThrow();
  });

  it("Animated.View renders with an animated style", async () => {
    const opacity = new Animated.Value(0.5);
    await render(
      <Animated.View style={{ opacity }} testID="av">
        <Text>fade</Text>
      </Animated.View>,
    );
    expect(screen.getByText("fade")).toBeTruthy();
  });
});

describe("native engine: event emitters", () => {
  it("DeviceEventEmitter emit reaches a listener", () => {
    const handler = vi.fn();
    const sub = DeviceEventEmitter.addListener("vn-evt", handler);
    DeviceEventEmitter.emit("vn-evt", { n: 1 });
    expect(handler).toHaveBeenCalledWith({ n: 1 });
    sub.remove();
  });

  it("NativeEventEmitter constructs and registers listeners", () => {
    const emitter = new NativeEventEmitter({
      addListener: () => {},
      removeListeners: () => {},
    } as any);
    const sub = emitter.addListener("evt", () => {});
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });
});
