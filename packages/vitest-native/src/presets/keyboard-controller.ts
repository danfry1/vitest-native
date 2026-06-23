import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

// react-native-keyboard-controller drives keyboard animation through native
// modules + worklets that can't run in Node. Shadow it the way its own
// `react-native-keyboard-controller/jest` mock does: containers render their
// children through real RN, the imperative KeyboardController is a no-op, and the
// reanimated-backed hooks return inert shared-value shapes.
export function keyboardController(): Preset {
  return {
    name: "keyboardController",
    modules: {
      "react-native-keyboard-controller": {
        exports: [
          "KeyboardProvider",
          "KeyboardAvoidingView",
          "KeyboardAwareScrollView",
          "KeyboardStickyView",
          "KeyboardGestureArea",
          "KeyboardToolbar",
          "OverKeyboardView",
          "KeyboardController",
          "KeyboardEvents",
          "FocusedInputEvents",
          "AndroidSoftInputModes",
          "useKeyboardController",
          "useKeyboardHandler",
          "useKeyboardAnimation",
          "useReanimatedKeyboardAnimation",
          "useFocusedInputHandler",
          "useReanimatedFocusedInput",
          "useGenericKeyboardHandler",
          "useResizeMode",
        ],
        factory: () => {
          function hostComponent(name: string) {
            const Component = React.forwardRef((props: any, ref: any) =>
              React.createElement(name, { ...props, ref }, props.children),
            );
            Component.displayName = name;
            return Component;
          }

          // A reanimated SharedValue-shaped object (the preset shadows reanimated
          // too, so a plain { value } is all consumers can read here).
          const sharedValue = (value: unknown) => ({ value });

          const KeyboardController = {
            setInputMode: vi.fn(),
            setDefaultMode: vi.fn(),
            setFocusTo: vi.fn(),
            dismiss: vi.fn(() => Promise.resolve()),
            isVisible: vi.fn(() => false),
            state: vi.fn(() => ({
              height: 0,
              progress: 0,
              duration: 0,
              timestamp: 0,
              target: -1,
              type: 0,
              appearance: "default",
            })),
          };

          const noopSubscription = { remove: vi.fn() };
          const eventModule = {
            addListener: vi.fn(() => noopSubscription),
            removeAllListeners: vi.fn(),
          };

          return {
            KeyboardProvider: hostComponent("KeyboardProvider"),
            KeyboardAvoidingView: hostComponent("KeyboardAvoidingView"),
            KeyboardAwareScrollView: hostComponent("KeyboardAwareScrollView"),
            KeyboardStickyView: hostComponent("KeyboardStickyView"),
            KeyboardGestureArea: hostComponent("KeyboardGestureArea"),
            KeyboardToolbar: hostComponent("KeyboardToolbar"),
            OverKeyboardView: hostComponent("OverKeyboardView"),
            KeyboardController,
            KeyboardEvents: eventModule,
            FocusedInputEvents: eventModule,
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
            useKeyboardController: () => ({ enabled: true, setEnabled: vi.fn() }),
            useKeyboardHandler: () => {},
            useKeyboardAnimation: () => ({ height: sharedValue(0), progress: sharedValue(0) }),
            useReanimatedKeyboardAnimation: () => ({
              height: sharedValue(0),
              progress: sharedValue(0),
            }),
            useFocusedInputHandler: () => {},
            useReanimatedFocusedInput: () => ({ input: sharedValue(null) }),
            useGenericKeyboardHandler: () => {},
            useResizeMode: () => {},
          };
        },
      },
    },
  };
}
