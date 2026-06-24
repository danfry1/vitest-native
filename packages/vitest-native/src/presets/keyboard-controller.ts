import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createViewMock } from "../mocks/components/View.js";
import { createScrollViewMock } from "../mocks/components/ScrollView.js";

// react-native-keyboard-controller drives keyboard animation through native
// modules + worklets that can't run in Node. Shadow it the way its own
// `react-native-keyboard-controller/jest` mock does: layout containers render
// through real RN (View/ScrollView), the imperative `KeyboardController` is inert,
// and the animation hooks return stable shared-value-shaped handles.
export function keyboardController(): Preset {
  return {
    name: "keyboardController",
    modules: {
      "react-native-keyboard-controller": {
        exports: [
          "KeyboardProvider",
          "KeyboardControllerView",
          "KeyboardGestureArea",
          "OverKeyboardView",
          "KeyboardBackgroundView",
          "KeyboardExtender",
          "KeyboardStickyView",
          "KeyboardAvoidingView",
          "KeyboardAwareScrollView",
          "KeyboardChatScrollView",
          "KeyboardToolbar",
          "KeyboardController",
          "KeyboardEvents",
          "AndroidSoftInputModes",
          "DefaultKeyboardToolbarTheme",
          "useKeyboardAnimation",
          "useReanimatedKeyboardAnimation",
          "useResizeMode",
          "useGenericKeyboardHandler",
          "useKeyboardHandler",
          "useKeyboardContext",
          "useKeyboardState",
          "useReanimatedFocusedInput",
          "useFocusedInputHandler",
          "useKeyboardController",
          "useWindowDimensions",
        ],
        factory: () => {
          function hostComponent(name: string) {
            const Component = React.forwardRef((props: any, ref: any) =>
              React.createElement(name, { ...props, ref }, props.children),
            );
            Component.displayName = name;
            return Component;
          }

          // A reanimated SharedValue-shaped handle (read via `.value`, with get/set).
          const sharedValue = (value: unknown) => ({
            value,
            get: () => value,
            set: () => {},
          });
          const animationValues = {
            animated: { progress: sharedValue(0), height: sharedValue(0) },
            reanimated: { progress: sharedValue(0), height: sharedValue(0) },
          };
          const lastKeyboardEvent = {
            height: 0,
            duration: 0,
            timestamp: 0,
            target: 0,
            type: "default",
            appearance: "default",
          };
          const keyboardState = { ...lastKeyboardEvent, isVisible: false };
          const focusedInput = {
            input: sharedValue({
              target: 1,
              parentScrollViewTarget: -1,
              layout: { x: 0, y: 0, width: 200, height: 40, absoluteX: 0, absoluteY: 100 },
            }),
          };

          const KeyboardToolbar = Object.assign(createViewMock(), {
            Background: hostComponent("KeyboardToolbar.Background"),
            Content: hostComponent("KeyboardToolbar.Content"),
            Prev: hostComponent("KeyboardToolbar.Prev"),
            Next: hostComponent("KeyboardToolbar.Next"),
            Done: hostComponent("KeyboardToolbar.Done"),
            Group: hostComponent("KeyboardToolbar.Group"),
          });

          return {
            // providers + views
            KeyboardProvider: hostComponent("KeyboardProvider"),
            KeyboardControllerView: hostComponent("KeyboardControllerView"),
            KeyboardGestureArea: hostComponent("KeyboardGestureArea"),
            OverKeyboardView: hostComponent("OverKeyboardView"),
            KeyboardBackgroundView: hostComponent("KeyboardBackgroundView"),
            KeyboardExtender: hostComponent("KeyboardExtender"),
            // layout components backed by real RN (so children render + behave)
            KeyboardStickyView: createViewMock(),
            KeyboardAvoidingView: createViewMock(),
            KeyboardAwareScrollView: createScrollViewMock(),
            KeyboardChatScrollView: createScrollViewMock(),
            KeyboardToolbar,
            // imperative module
            KeyboardController: {
              setInputMode: vi.fn(),
              setDefaultMode: vi.fn(),
              preload: vi.fn(),
              dismiss: vi.fn(() => Promise.resolve()),
              setFocusTo: vi.fn(),
              isVisible: vi.fn(() => false),
              state: vi.fn(() => lastKeyboardEvent),
              viewPositionInWindow: vi.fn(() =>
                Promise.resolve({ x: 0, y: 0, width: 0, height: 0 }),
              ),
            },
            KeyboardEvents: { addListener: vi.fn(() => ({ remove: vi.fn() })) },
            AndroidSoftInputModes: {
              SOFT_INPUT_ADJUST_NOTHING: 48,
              SOFT_INPUT_ADJUST_PAN: 32,
              SOFT_INPUT_ADJUST_RESIZE: 16,
              SOFT_INPUT_ADJUST_UNSPECIFIED: 0,
              SOFT_INPUT_IS_FORWARD_NAVIGATION: 256,
              SOFT_INPUT_MASK_ADJUST: 240,
              SOFT_INPUT_MASK_STATE: 15,
              SOFT_INPUT_MODE_CHANGED: 512,
              SOFT_INPUT_STATE_ALWAYS_HIDDEN: 3,
              SOFT_INPUT_STATE_ALWAYS_VISIBLE: 5,
              SOFT_INPUT_STATE_HIDDEN: 2,
              SOFT_INPUT_STATE_UNCHANGED: 1,
              SOFT_INPUT_STATE_UNSPECIFIED: 0,
              SOFT_INPUT_STATE_VISIBLE: 4,
            },
            DefaultKeyboardToolbarTheme: {
              light: {
                primary: "#2c2c2c",
                disabled: "#B0BEC5",
                background: "#f3f3f4",
                ripple: "#bcbcbcbc",
              },
              dark: {
                primary: "#fafafa",
                disabled: "#707070",
                background: "#2C2C2E",
                ripple: "#F8F8F888",
              },
            },
            // hooks
            useKeyboardAnimation: () => animationValues.animated,
            useReanimatedKeyboardAnimation: () => animationValues.reanimated,
            useResizeMode: () => {},
            useGenericKeyboardHandler: () => {},
            useKeyboardHandler: () => {},
            useKeyboardContext: () => animationValues,
            useKeyboardState: (selector?: (s: typeof keyboardState) => unknown) =>
              selector ? selector(keyboardState) : keyboardState,
            useReanimatedFocusedInput: () => focusedInput,
            useFocusedInputHandler: () => {},
            useKeyboardController: () => ({ enabled: true, setEnabled: vi.fn() }),
            useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
          };
        },
      },
    },
  };
}
