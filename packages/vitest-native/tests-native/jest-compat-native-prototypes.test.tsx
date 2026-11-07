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
