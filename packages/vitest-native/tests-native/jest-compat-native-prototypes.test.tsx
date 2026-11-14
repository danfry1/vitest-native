/**
 * Under jest-compat, View has the prototype React Native's Jest preset gives its stand-in:
 * the native methods (measure, focus, …), which a View ref has. It is the native methods
 * object of the native engine's host class for RCTView, one per view name, which the
 * class's methods delegate to, so a spy on it reaches every View ref, whichever route made
 * the host (jest-compat/setup.mjs, native/boundary.mjs). Text and ScrollView keep React
 * Native's own shape: exposing theirs would load them in every test file.
 */
import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { afterEach, expect, it, vi } from "vitest";

// As react-native-paper's Menu reads it, at module level.
const querySelector = Object.getOwnPropertyDescriptor(View.prototype, "querySelector");

afterEach(() => {
  vi.restoreAllMocks();
});

it("gives View a prototype with the native methods", () => {
  expect(querySelector).toBeUndefined();
  const prototype = (View as unknown as { prototype: Record<string, unknown> }).prototype;
  for (const method of ["measure", "measureInWindow", "measureLayout", "focus", "blur"]) {
    expect(typeof prototype[method], method).toBe("function");
  }
});

it("reaches refs with a spy on View.prototype, as under Jest", async () => {
  const measure = vi
    .spyOn(View.prototype as unknown as { measure: (cb: Function) => void }, "measure")
    .mockImplementation(function (callback: Function) {
      callback(0, 0, 100, 50, 10, 20);
    });
  const viewRef = React.createRef<View>();
  const textRef = React.createRef<Text>();
  await render(
    <View ref={viewRef}>
      <Text ref={textRef}>hello</Text>
    </View>,
  );
  const layout = vi.fn();
  viewRef.current!.measure(layout);
  expect(measure).toHaveBeenCalledTimes(1);
  expect(layout).toHaveBeenCalledWith(0, 0, 100, 50, 10, 20);
  // A Text ref has the native methods too (its host is a boundary class), but Text itself
  // gets no prototype here.
  expect(typeof (textRef.current as unknown as { focus: unknown }).focus).toBe("function");
});

it("makes one host class per view name, whichever route asks for it", () => {
  const registry = require("react-native/Libraries/NativeComponent/NativeComponentRegistry");
  const requireNativeComponent = require("react-native/Libraries/ReactNative/requireNativeComponent");
  const viewNative = require("react-native/Libraries/Components/View/ViewNativeComponent");
  const shim = require("react-native/Libraries/Renderer/shims/createReactNativeComponentClass");
  const host = registry.get("RCTView");
  expect(requireNativeComponent.default("RCTView")).toBe(host);
  expect(viewNative.default).toBe(host);
  expect(shim.default("RCTView")).toBe(host);
  expect((View as unknown as { prototype: object }).prototype).toBe(host.nativeMethods);
});

// React Native's Jest preset makes View a class, so a View ref is an instance of it.
// React Native's own View is a forwardRef object, which `instanceof` cannot call.
it("answers `instanceof View` for View's host instances, as under Jest", async () => {
  const { Animated, Pressable, ScrollView } = require("react-native");
  const refs = {
    view: React.createRef<unknown>(),
    animated: React.createRef<unknown>(),
    pressable: React.createRef<unknown>(),
    text: React.createRef<unknown>(),
    scroll: React.createRef<unknown>(),
  };
  await render(
    <View ref={refs.view as never}>
      <Animated.View ref={refs.animated} />
      <Pressable ref={refs.pressable as never} />
      <Text ref={refs.text as never}>hello</Text>
      <ScrollView ref={refs.scroll as never} />
    </View>,
  );
  const isView = (value: unknown) => value instanceof (View as unknown as Function);
  expect(isView(refs.view.current)).toBe(true);
  expect(isView(refs.animated.current)).toBe(true);
  expect(isView(refs.pressable.current)).toBe(true);
  expect(isView(refs.text.current)).toBe(false);
  expect(isView(refs.scroll.current)).toBe(false);
  for (const value of [null, undefined, {}, "View", 1, View]) {
    expect(isView(value), String(value)).toBe(false);
  }
});

// As react-native-paper's Menu tests use it: View stands in for HTMLElement, and the
// component checks `el instanceof HTMLElement` in a layout effect.
it("lets View stand in for a DOM class in an instanceof check", async () => {
  const focus = vi.fn();
  function Focuser() {
    const ref = React.useRef<unknown>(null);
    React.useLayoutEffect(() => {
      const HTMLElementLike = (globalThis as { HTMLElementLike?: Function }).HTMLElementLike!;
      if (ref.current instanceof HTMLElementLike) focus();
    }, []);
    return <View ref={ref as never} />;
  }
  Object.defineProperty(globalThis, "HTMLElementLike", { configurable: true, value: View });
  try {
    await render(<Focuser />);
  } finally {
    delete (globalThis as { HTMLElementLike?: unknown }).HTMLElementLike;
  }
  expect(focus).toHaveBeenCalledTimes(1);
});

// react-native-paper's Menu tests add querySelector to View.prototype and call it on a
// View ref, as a Jest-preset View ref inherits whatever its class's prototype has.
it("reaches View refs with a method added to View.prototype, and only View refs", async () => {
  const prototype = View.prototype as unknown as Record<string, unknown>;
  const viewRef = React.createRef<unknown>();
  const textRef = React.createRef<unknown>();
  Object.defineProperty(prototype, "querySelector", { configurable: true, value: () => "found" });
  try {
    await render(
      <View ref={viewRef as never}>
        <Text ref={textRef as never}>hello</Text>
      </View>,
    );
    expect((viewRef.current as { querySelector: () => string }).querySelector()).toBe("found");
    expect((textRef.current as { querySelector?: unknown }).querySelector).toBeUndefined();
  } finally {
    delete prototype.querySelector;
  }
});

// View's prototype is on its host class's chain, but View is not a class: React and
// libraries' createAnimatedComponent read prototype.isReactComponent to tell.
it("keeps View from looking like a class component", () => {
  expect((View.prototype as { isReactComponent?: unknown }).isReactComponent).toBeUndefined();
  const host = require("react-native/Libraries/NativeComponent/NativeComponentRegistry").get("RCTView");
  expect(host.prototype.isReactComponent).toBe(React.Component.prototype.isReactComponent);
});
