// Gesture Handler 3's buttons, pressable from Testing Library under the native engine.
//
// The package's jestSetup.js mocks its native module, its legacy buttons and its gesture
// detector host, but leaves the native button host (components/GestureHandlerButton)
// real, which v3's Touchable, RectButton, BorderlessButton and Pressable render. That host
// takes `onButtonPress*` callbacks, which only the device's native view calls, and
// RectButton and BorderlessButton press through a native gesture's state changes instead.
// So in a test nothing could press them: userEvent found no handler, and fireEvent reached
// Touchable's composite `onPress` even while disabled (#351).
//
// The package already has a convention for this: its own Pressable gives the button host
// `testOnly_onPress` (and the other press events) in a test environment, which Testing
// Library's event lookup reads. Two mocks follow it, registered after the package's
// jestSetup.js with the same Jest semantics (library-jest.mjs), so they live and reset
// with the package's own:
//
// - the button host is the real host component with its props as given, plus a
//   `testOnly_*` handler for each `onButton*` callback it has, called with the button's
//   own event shape. A disabled button (`enabled={false}`) takes the press and does
//   nothing, as the native view does, so it no longer reaches a parent's handler. A
//   `testOnly_*` the caller passed (Pressable's) is kept as it is;
// - the gesture detector host is jestSetup.js's own View, and, around such a button
//   with no press handler of its own (RectButton, BorderlessButton), it gives the button
//   a press that plays the tap a device sends its native gesture (began, active, end)
//   through the package's own Jest utilities (fireGestureHandler), so the button's own
//   onBegin/onFinalize decide what is pressed.

/** The package's setup file, as LIBRARY_SETUP_FILES (preset-map.ts) lists it. */
export const GESTURE_HANDLER_SETUP = "react-native-gesture-handler/jestSetup.js";

/** The button host and detector mocks, registered from the package's jestSetup.js. */
// `support` is the library's `jest`, under another name: the project's jestMockTransform
// rewrites a `jest.mock(...)` call in any module Vite compiles, this one included.
export function registerGestureHandlerButtons(support) {
  for (const base of ["./src", "./lib/module"]) {
    const buttonSpec = `${base}/components/GestureHandlerButton`;
    support.mock(buttonSpec, () => buttonModule(support, support.requireActual(buttonSpec)));
    support.mock(`${base}/v3/detectors/HostGestureDetector`, () => detectorModule(support, base));
  }
}

const IS_BUTTON = Symbol.for("vitest-native.gestureHandlerButton");

/** The press events Testing Library dispatches, and the button callbacks they reach. */
const PRESS_EVENTS = [
  ["testOnly_onPressIn", "onButtonPressIn"],
  ["testOnly_onPressOut", "onButtonPressOut"],
  ["testOnly_onLongPress", "onButtonLongPress"],
  ["testOnly_onPress", "onButtonPress"],
];

function noop() {}

/** The button's own event (specs/RNGestureHandlerButtonNativeComponent ButtonEvent). */
function buttonEvent(event) {
  const touch = event?.nativeEvent ?? {};
  const x = touch.locationX ?? 0;
  const y = touch.locationY ?? 0;
  return {
    nativeEvent: {
      pointerInside: true,
      x,
      y,
      absoluteX: touch.pageX ?? x,
      absoluteY: touch.pageY ?? y,
      numberOfPointers: 1,
      pointerType: 0,
    },
  };
}

function buttonModule(support, actual) {
  const React = support.requireActual("react");
  const Host = actual.default ?? actual.ButtonComponent;
  function GestureHandlerButton(props) {
    const handlers = {};
    for (const [testOnly, callback] of PRESS_EVENTS) {
      if (props[testOnly] !== undefined) continue;
      if (props.enabled === false) {
        handlers[testOnly] = noop;
        continue;
      }
      const call = props[callback];
      if (typeof call !== "function") continue;
      handlers[testOnly] = (event) => {
        const own = buttonEvent(event);
        call(own);
        // A device ends every interaction with this event, after its press or press-out.
        if (callback === "onButtonPress") props.onButtonInteractionFinished?.(own);
      };
    }
    return React.createElement(Host, { ...props, ...handlers });
  }
  GestureHandlerButton[IS_BUTTON] = true;
  return {
    ...actual,
    __esModule: true,
    default: GestureHandlerButton,
    ButtonComponent: GestureHandlerButton,
  };
}

/** Whether a button host's own props already handle a press. */
function handlesPress(props) {
  return PRESS_EVENTS.some(
    ([testOnly, callback]) =>
      props[testOnly] !== undefined || typeof props[callback] === "function",
  );
}

function detectorModule(support, base) {
  const React = support.requireActual("react");
  const { View } = support.requireActual("react-native");
  function HostGestureDetector(props) {
    const child = React.Children.toArray(props.children);
    const button = child.length === 1 ? child[0] : null;
    if (
      button === null ||
      !button.type?.[IS_BUTTON] ||
      button.props.enabled === false ||
      handlesPress(button.props) ||
      typeof props.onGestureHandlerStateChange !== "function"
    ) {
      return React.createElement(View, props);
    }
    // The button's native gesture, as the package's Jest utilities take a v3 gesture.
    const gesture = {
      type: "NativeViewGestureHandler",
      handlerTag: props.handlerTags?.[0],
      config: { enabled: true },
      detectorCallbacks: { jsEventHandler: props.onGestureHandlerStateChange },
    };
    const tap = () => {
      const { fireGestureHandler } = support.requireActual(`${base}/jestUtils`);
      const { State } = support.requireActual(`${base}/State`);
      fireGestureHandler(gesture, [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
    };
    // The detector is `pointerEvents="box-none"`, which a press passes through, so the
    // button it wraps is what takes it.
    const pressable = React.cloneElement(button, { testOnly_onPress: tap });
    return React.createElement(View, { ...props, children: pressable });
  }
  return { __esModule: true, default: HostGestureDetector };
}
