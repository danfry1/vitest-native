import type { Preset } from "../types.js";
import { vi } from "vitest";
import { hosts } from "../mocks/host-classes.js";
import { createViewMock } from "../mocks/components/View.js";
import { createScrollViewMock } from "../mocks/components/ScrollView.js";
import { builtInPreset } from "./built-in.js";
import { libraryMockModule, type LibraryMock } from "./library-mock.js";
import { sharedValue as workingSharedValue } from "./reanimated.js";
import type { PresetFactoryContext } from "../types.js";

// Under the native engine the module is keyboard-controller's own Jest mock
// (`react-native-keyboard-controller/jest`), as a Jest suite installs it: its hooks
// return React Native `Animated.Value`s and are mock functions. Under the mock engine,
// and for a version without that mock, the module below serves.
const KEYBOARD_CONTROLLER_MOCK: LibraryMock = {
  pkg: "react-native-keyboard-controller",
  entry: "jest",
  file: "jest/index.js",
  // The mock (1.22.9) leaves out public exports and gives shared values without Reanimated
  // 4's shape; mockCorrections lists each correction. A mock that has a name keeps its own.
  addsNames: [
    "useAnimatedKeyboard",
    "KeyboardState",
    "KEYBOARD_BORDER_RADIUS",
    "KEYBOARD_HAS_ROUNDED_CORNERS",
    "KeyboardContext",
  ],
  extend: (mock, _dir, { React }) => mockCorrections(React, mock),
};

/** The package's `KeyboardState` (src/compat.ts). */
const KEYBOARD_STATE = { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 };

/** Whether `value` has Reanimated 4's shared value shape, listeners and modify() included. */
function isSharedValue(value: unknown): boolean {
  const v = value as Record<string, unknown> | null | undefined;
  return (
    !!v &&
    typeof v.get === "function" &&
    typeof v.addListener === "function" &&
    typeof v.removeListener === "function" &&
    typeof v.modify === "function"
  );
}

/**
 * What a mock hook made with `mockReturnValue` returns, read from its implementation so
 * the hook records no call; undefined for anything else.
 */
function returnedBy(hook: unknown): any {
  try {
    const impl = (hook as { getMockImplementation?: () => unknown })?.getMockImplementation?.();
    return typeof impl === "function" ? impl() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The library's own mock, with what it lacks of the package's public API (#708):
 *
 * - `useReanimatedKeyboardAnimation()` and `useReanimatedFocusedInput().input` are shared
 *   values with listeners and modify(), which the preset's Reanimated reads (the mock's are
 *   `{ value, get, set }`); `useReanimatedFocusedInput()` has `update`.
 * - `KeyboardContext`, with the package's default value (src/context.ts), and a
 *   `useKeyboardContext()` that reads it, so it has `enabled`, `layout`, `update` and the
 *   setters, where the mock's returns the animation values only.
 * - `useAnimatedKeyboard()` and `KeyboardState` (src/compat.ts): a height and a state per
 *   component, at 0 and UNKNOWN, as before any keyboard event.
 * - `KEYBOARD_BORDER_RADIUS` 0 and `KEYBOARD_HAS_ROUNDED_CORNERS` false, a keyboard without
 *   rounded corners, and `KeyboardController.setTranslucent`.
 */
export function mockCorrections(
  React: PresetFactoryContext["React"],
  mock: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...mock };
  const noop = () => {};

  const animation = returnedBy(mock.useReanimatedKeyboardAnimation);
  const reanimated =
    isSharedValue(animation?.progress) && isSharedValue(animation?.height)
      ? animation
      : { progress: workingSharedValue(0), height: workingSharedValue(0) };
  if (reanimated !== animation) {
    out.useReanimatedKeyboardAnimation = vi.fn(() => reanimated);
  }

  const focused = returnedBy(mock.useReanimatedFocusedInput);
  if (!isSharedValue(focused?.input) || typeof focused?.update !== "function") {
    const input = isSharedValue(focused?.input)
      ? focused.input
      : workingSharedValue(focused?.input?.value ?? null);
    const corrected = { input, update: vi.fn(() => Promise.resolve()) };
    out.useReanimatedFocusedInput = vi.fn(() => corrected);
  }

  if (!("KeyboardContext" in mock)) {
    out.KeyboardContext = React.createContext({
      enabled: true,
      animated:
        returnedBy(mock.useKeyboardAnimation) ?? returnedBy(mock.useKeyboardContext)?.animated,
      reanimated,
      layout: workingSharedValue(null),
      update: () => Promise.resolve(),
      setKeyboardHandlers: () => noop,
      setInputHandlers: () => noop,
      setEnabled: noop,
    });
  }
  const context = returnedBy(mock.useKeyboardContext);
  const contextKeys = [
    "enabled",
    "layout",
    "update",
    "setKeyboardHandlers",
    "setInputHandlers",
    "setEnabled",
  ];
  if (!context || contextKeys.some((key) => !(key in context))) {
    const KeyboardContext = out.KeyboardContext;
    out.useKeyboardContext = vi.fn(function useKeyboardContext() {
      return React.useContext(KeyboardContext);
    });
  }

  if (!("KeyboardState" in mock)) out.KeyboardState = KEYBOARD_STATE;
  const states = out.KeyboardState as typeof KEYBOARD_STATE;
  if (!("useAnimatedKeyboard" in mock)) {
    out.useAnimatedKeyboard = vi.fn(function useAnimatedKeyboard() {
      const values = React.useRef<Record<"height" | "state", unknown> | null>(null);
      values.current ??= {
        height: workingSharedValue(0),
        state: workingSharedValue(states.UNKNOWN),
      };
      return values.current;
    });
  }

  if (!("KEYBOARD_BORDER_RADIUS" in mock)) out.KEYBOARD_BORDER_RADIUS = 0;
  if (!("KEYBOARD_HAS_ROUNDED_CORNERS" in mock)) {
    out.KEYBOARD_HAS_ROUNDED_CORNERS = out.KEYBOARD_BORDER_RADIUS > 0;
  }
  if (mock.KeyboardController && !("setTranslucent" in mock.KeyboardController)) {
    out.KeyboardController = { ...mock.KeyboardController, setTranslucent: vi.fn() };
  }
  return out;
}

// react-native-keyboard-controller drives keyboard animation through native
// modules + worklets that can't run in Node. Shadow it the way its own
// `react-native-keyboard-controller/jest` mock does: layout containers render
// through real RN (View/ScrollView), the imperative `KeyboardController` is inert,
// and the animation hooks return stable shared-value-shaped handles.
export function keyboardController(): Preset {
  return builtInPreset({
    name: "keyboardController",
    modules: {
      "react-native-keyboard-controller": libraryMockModule(KEYBOARD_CONTROLLER_MOCK, {
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
        factory: ({ React }) => {
          const { asHost } = hosts(React);
          function hostComponent(name: string) {
            const Component = React.forwardRef((props: any, ref: any) =>
              React.createElement(asHost(name), { ...props, ref }, props.children),
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

          const KeyboardToolbar = Object.assign(createViewMock(React), {
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
            KeyboardStickyView: createViewMock(React),
            KeyboardAvoidingView: createViewMock(React),
            KeyboardAwareScrollView: createScrollViewMock(React),
            KeyboardChatScrollView: createScrollViewMock(React),
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
      }),
    },
  });
}
