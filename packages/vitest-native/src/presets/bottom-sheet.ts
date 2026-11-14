import type { Preset } from "../types.js";
import { vi } from "vitest";
import { createTextInputMock } from "../mocks/components/TextInput.js";
import { createScrollViewMock } from "../mocks/components/ScrollView.js";
import { createFlatListMock } from "../mocks/components/FlatList.js";
import { createSectionListMock } from "../mocks/components/SectionList.js";
import { createVirtualizedListMock } from "../mocks/components/VirtualizedList.js";
import { createTouchableOpacityMock } from "../mocks/components/TouchableOpacity.js";
import { createTouchableHighlightMock } from "../mocks/components/TouchableHighlight.js";
import { createTouchableWithoutFeedbackMock } from "../mocks/components/TouchableWithoutFeedback.js";
import { builtInPreset } from "./built-in.js";
import { libraryMockModule, type LibraryMock } from "./library-mock.js";
import { activeReactNative } from "./active-react-native.js";
import { sharedValue as workingSharedValue } from "./reanimated.js";
import type { PresetFactoryContext } from "../types.js";

// Under the native engine the module is bottom-sheet's own Jest mock
// (`@gorhom/bottom-sheet/mock`), as a Jest suite installs it with
// `jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'))`.
// Under the mock engine, and for a version without that mock, the module below serves.
const BOTTOM_SHEET_MOCK: LibraryMock = {
  pkg: "@gorhom/bottom-sheet",
  entry: "mock",
  file: "mock.js",
  keepsPresetNames: true,
  extend: (mock, _dir, { React }) => mockCorrections(React, mock),
};

/**
 * The public API @gorhom/bottom-sheet 5.2.14 exports from its index that its mock leaves
 * out (#714): the hooks a custom gesture or scrollable uses, as inert handlers, and the
 * constants (src/constants.ts), with the platform the test runs as. `ScrollView` is what a
 * created scrollable renders: the engine's.
 */
export function bottomSheetAdditions(
  React: PresetFactoryContext["React"],
  ScrollView: unknown,
): Record<string, unknown> {
  const { Platform } = activeReactNative();
  const noop = () => {};
  const gestureHandlers = () => ({
    handleOnStart: noop,
    handleOnChange: noop,
    handleOnEnd: noop,
    handleOnFinalize: noop,
  });
  const ANIMATION_DURATION = 250;
  // Reanimated's Easing.out(Easing.exp): 1 - 2^(-10t).
  const ANIMATION_EASING = (t: number) => 1 - Math.pow(2, -10 * t);
  const INITIAL_LAYOUT_VALUE = -999;
  return {
    useBottomSheetGestureHandlers: vi.fn(() => ({
      contentPanGestureHandler: gestureHandlers(),
      handlePanGestureHandler: gestureHandlers(),
    })),
    useGestureEventsHandlersDefault: vi.fn(gestureHandlers),
    useScrollEventsHandlersDefault: vi.fn(() => ({
      handleOnScroll: noop,
      handleOnBeginDrag: noop,
      handleOnEndDrag: noop,
      handleOnMomentumBegin: noop,
      handleOnMomentumEnd: noop,
    })),
    // The package's hook makes an animated ref and a scroll handler that calls `onScroll`
    // with `{ nativeEvent }`; here the ref is callable as an AnimatedRef is, and the handler
    // calls the latest `onScroll` when a test calls it with an event.
    useScrollHandler: vi.fn(function useScrollHandler(_: unknown, onScroll?: (e: unknown) => void) {
      const latest = React.useRef(onScroll);
      latest.current = onScroll;
      const held = React.useRef<Record<string, unknown> | null>(null);
      held.current ??= {
        scrollHandler: (event: unknown) => latest.current?.({ nativeEvent: event }),
        scrollableRef: Object.assign(() => null, { current: null, observe: () => () => {} }),
        scrollableContentOffsetY: workingSharedValue(0),
      };
      return held.current;
    }),
    useScrollableSetter: vi.fn(),
    useBottomSheetScrollableCreator: vi.fn(
      () => (props: object, ref?: unknown) =>
        React.createElement(ScrollView as React.ElementType, { ...props, ref }),
    ),
    ANIMATION_DURATION,
    ANIMATION_EASING,
    ANIMATION_CONFIGS:
      Platform.OS === "android"
        ? { duration: ANIMATION_DURATION, easing: ANIMATION_EASING }
        : {
            damping: 500,
            stiffness: 1000,
            mass: 3,
            overshootClamping: true,
            restDisplacementThreshold: 10,
            restSpeedThreshold: 10,
          },
    // Keyed by SCROLLABLE_STATUS: UNDETERMINED 2, LOCKED 0, UNLOCKED 1.
    SCROLLABLE_DECELERATION_RATE_MAPPER: {
      2: 0,
      0: 0,
      1: Platform.OS === "ios" ? 0.998 : Platform.OS === "android" ? 0.985 : 1,
    },
    MODAL_STACK_BEHAVIOR: { replace: "replace", push: "push", switch: "switch" },
    KEYBOARD_BEHAVIOR: { interactive: "interactive", extend: "extend", fillParent: "fillParent" },
    KEYBOARD_BLUR_BEHAVIOR: { none: "none", restore: "restore" },
    KEYBOARD_INPUT_MODE: { adjustPan: "adjustPan", adjustResize: "adjustResize" },
    KEYBOARD_DISMISS_THRESHOLD: 12.5,
    INITIAL_LAYOUT_VALUE,
    INITIAL_CONTAINER_LAYOUT: {
      height: INITIAL_LAYOUT_VALUE,
      offset: { top: 0, bottom: 0, right: 0, left: 0 },
    },
  };
}

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
 * The library's own mock, with the names it leaves out (bottomSheetAdditions) and these
 * shapes corrected (#714), each only while the mock's is wrong:
 *
 * - `useBottomSheet()`'s `animatedIndex` and `animatedPosition` are shared values with
 *   listeners and modify(); the mock's are `{ value, get, set }`.
 * - `useBottomSheetInternal()` and `useBottomSheetModalInternal()` return the context the
 *   package declares, with a closed sheet's values (the sheet's initial states and default
 *   props, src/components/bottomSheet), where the mock answers every other read with one
 *   `{ value: 0 }` stub, so its booleans were objects and its refs were not refs.
 * - `createBottomSheetScrollableComponent` returns a memoised forwardRef component, as the
 *   package's does.
 */
export function mockCorrections(
  React: PresetFactoryContext["React"],
  mock: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...mock };
  for (const [name, value] of Object.entries(
    bottomSheetAdditions(React, mock.BottomSheetScrollView),
  )) {
    if (!(name in mock)) out[name] = value;
  }

  const sheet = typeof mock.useBottomSheet === "function" ? mock.useBottomSheet() : undefined;
  const animatedIndex = workingSharedValue(0);
  const animatedPosition = workingSharedValue(0);
  if (sheet && !(isSharedValue(sheet.animatedIndex) && isSharedValue(sheet.animatedPosition))) {
    out.useBottomSheet = () => ({ ...mock.useBottomSheet(), animatedIndex, animatedPosition });
  }

  const internal =
    typeof mock.useBottomSheetInternal === "function" ? mock.useBottomSheetInternal() : undefined;
  if (internal && typeof internal.enableOverDrag !== "boolean") {
    const { Dimensions } = activeReactNative();
    const context = {
      stopAnimation: internal.stopAnimation,
      animateToPosition: internal.animateToPosition,
      setScrollableRef: internal.setScrollableRef,
      removeScrollableRef: internal.removeScrollableRef,
      animatedDetentsState: workingSharedValue({}),
      animatedAnimationState: workingSharedValue({ status: 0, source: 1 }),
      animatedSheetState: workingSharedValue(0),
      animatedKeyboardState: workingSharedValue({
        status: 0,
        height: 0,
        heightWithinContainer: 0,
        easing: "keyboard",
        duration: 500,
      }),
      animatedContentGestureState: workingSharedValue(0),
      animatedHandleGestureState: workingSharedValue(0),
      animatedLayoutState: workingSharedValue({
        window: Dimensions.get("window"),
        rawContainerHeight: -999,
        containerHeight: -999,
        containerOffset: { top: 0, bottom: 0, right: 0, left: 0 },
        handleHeight: -999,
        footerHeight: -999,
        contentHeight: -999,
      }),
      animatedScrollableState: workingSharedValue({
        type: 0,
        contentOffsetY: 0,
        refreshable: false,
      }),
      animatedScrollableStatus: workingSharedValue(0),
      animatedPosition:
        out.useBottomSheet === mock.useBottomSheet ? sheet.animatedPosition : animatedPosition,
      animatedIndex:
        out.useBottomSheet === mock.useBottomSheet ? sheet.animatedIndex : animatedIndex,
      animatedSheetHeight: workingSharedValue(0),
      isInTemporaryPosition: workingSharedValue(false),
      enableContentPanningGesture: true,
      enableOverDrag: true,
      enablePanDownToClose: false,
      enableDynamicSizing: true,
      enableBlurKeyboardOnGesture: false,
      overDragResistanceFactor: 2.5,
      textInputNodesRef: { current: new Set<number>() },
    };
    out.useBottomSheetInternal = () => context;
  }

  const modalInternal =
    typeof mock.useBottomSheetModalInternal === "function"
      ? mock.useBottomSheetModalInternal()
      : undefined;
  if (modalInternal && typeof modalInternal.hostName !== "string") {
    const context = {
      hostName: "bottom-sheet-portal-0",
      containerLayoutState: workingSharedValue({
        height: -999,
        offset: { top: 0, bottom: 0, right: 0, left: 0 },
      }),
      mountSheet: modalInternal.mountSheet,
      unmountSheet: modalInternal.unmountSheet,
      willUnmountSheet: modalInternal.willUnmountSheet,
    };
    out.useBottomSheetModalInternal = () => context;
  }

  if (typeof mock.createBottomSheetScrollableComponent === "function") {
    // The 5.2.14 mock hands back the component it is given. Probed with a sentinel, so a
    // mock that wraps it, whatever the wrapper is, keeps its own.
    const sentinel = () => null;
    if (mock.createBottomSheetScrollableComponent(0, sentinel) === sentinel) {
      out.createBottomSheetScrollableComponent = (type: unknown, Scrollable: React.ElementType) => {
        // Made once per created component, not per render, so a render never remounts it.
        const Inner = mock.createBottomSheetScrollableComponent(type, Scrollable);
        return React.memo(
          React.forwardRef((props: object, ref) => React.createElement(Inner, { ...props, ref })),
        );
      };
    }
  }
  return out;
}

// @gorhom/bottom-sheet renders through reanimated worklets + gesture-handler
// natives that can't run in Node. Shadow it after the library's own
// `@gorhom/bottom-sheet/mock`: the scrollable/input/touchable members are backed by
// the engine's own RN component mocks (the library's mock uses the real RN
// components; the effect is the same — their content is queryable and they behave,
// e.g. changeText and list rows), the sheet containers render their children with
// no-op imperative refs, and the constants/hooks are re-exported.
export function bottomSheet(): Preset {
  return builtInPreset({
    name: "bottomSheet",
    modules: {
      "@gorhom/bottom-sheet": libraryMockModule(BOTTOM_SHEET_MOCK, {
        exports: [
          "BottomSheetModal",
          "BottomSheetModalProvider",
          "BottomSheetView",
          "BottomSheetDraggableView",
          "BottomSheetScrollView",
          "BottomSheetFlatList",
          "BottomSheetSectionList",
          "BottomSheetVirtualizedList",
          "BottomSheetFlashList",
          "BottomSheetTextInput",
          "BottomSheetBackdrop",
          "BottomSheetFooter",
          "BottomSheetFooterContainer",
          "BottomSheetHandle",
          "TouchableOpacity",
          "TouchableHighlight",
          "TouchableWithoutFeedback",
          "useBottomSheet",
          "useBottomSheetModal",
          "useBottomSheetInternal",
          "useBottomSheetModalInternal",
          "useBottomSheetSpringConfigs",
          "useBottomSheetTimingConfigs",
          "useBottomSheetDynamicSnapPoints",
          "createBottomSheetScrollableComponent",
          "enableLogging",
          // hooks for custom gestures and scrollables, and constants (bottomSheetAdditions)
          "useBottomSheetGestureHandlers",
          "useGestureEventsHandlersDefault",
          "useScrollEventsHandlersDefault",
          "useScrollHandler",
          "useScrollableSetter",
          "useBottomSheetScrollableCreator",
          "ANIMATION_CONFIGS",
          "ANIMATION_DURATION",
          "ANIMATION_EASING",
          "INITIAL_CONTAINER_LAYOUT",
          "INITIAL_LAYOUT_VALUE",
          "KEYBOARD_BEHAVIOR",
          "KEYBOARD_BLUR_BEHAVIOR",
          "KEYBOARD_DISMISS_THRESHOLD",
          "KEYBOARD_INPUT_MODE",
          "MODAL_STACK_BEHAVIOR",
          "SCROLLABLE_DECELERATION_RATE_MAPPER",
          // constants (`export * from './constants'`)
          "SNAP_POINT_TYPE",
          "SHEET_STATE",
          "SCROLLABLE_TYPE",
          "SCROLLABLE_STATUS",
          "ANIMATION_STATUS",
          "ANIMATION_SOURCE",
          "ANIMATION_METHOD",
          "KEYBOARD_STATUS",
          "GESTURE_SOURCE",
        ],
        factory: ({ React }) => {
          function container(name: string, methods: Record<string, () => void> = {}) {
            const Component = React.forwardRef((props: any, ref: any) => {
              React.useImperativeHandle(ref, () => methods);
              return React.createElement(name, props, props.children);
            });
            Component.displayName = name;
            return Component;
          }

          const sheetMethods = {
            expand: () => {},
            collapse: () => {},
            close: () => {},
            forceClose: () => {},
            snapToIndex: () => {},
            snapToPosition: () => {},
          };
          const modalMethods = { ...sheetMethods, present: () => {}, dismiss: () => {} };

          const BottomSheet = container("BottomSheet", sheetMethods);

          // Public constant enums, matching the values in the real package.
          const constants = {
            SNAP_POINT_TYPE: { PROVIDED: 0, DYNAMIC: 1 },
            SHEET_STATE: { CLOSED: 0, OPENED: 1, EXTENDED: 2, OVER_EXTENDED: 3, FILL_PARENT: 4 },
            SCROLLABLE_TYPE: {
              UNDETERMINED: 0,
              VIEW: 1,
              FLATLIST: 2,
              SCROLLVIEW: 3,
              SECTIONLIST: 4,
              VIRTUALIZEDLIST: 5,
            },
            SCROLLABLE_STATUS: { LOCKED: 0, UNLOCKED: 1, UNDETERMINED: 2 },
            ANIMATION_STATUS: { UNDETERMINED: 0, RUNNING: 1, STOPPED: 2, INTERRUPTED: 3 },
            ANIMATION_SOURCE: {
              NONE: 0,
              MOUNT: 1,
              GESTURE: 2,
              USER: 3,
              CONTAINER_RESIZE: 4,
              SNAP_POINT_CHANGE: 5,
              KEYBOARD: 6,
            },
            ANIMATION_METHOD: { TIMING: 0, SPRING: 1 },
            KEYBOARD_STATUS: { UNDETERMINED: 0, SHOWN: 1, HIDDEN: 2 },
            GESTURE_SOURCE: { UNDETERMINED: 0, SCROLLABLE: 1, HANDLE: 2, CONTENT: 3 },
          };

          return {
            __esModule: true,
            default: BottomSheet,
            BottomSheetModal: container("BottomSheetModal", modalMethods),
            BottomSheetModalProvider: container("BottomSheetModalProvider"),
            BottomSheetView: container("BottomSheetView"),
            BottomSheetDraggableView: container("BottomSheetDraggableView"),
            BottomSheetBackdrop: container("BottomSheetBackdrop"),
            BottomSheetFooter: container("BottomSheetFooter"),
            BottomSheetFooterContainer: container("BottomSheetFooterContainer"),
            BottomSheetHandle: container("BottomSheetHandle"),
            // Scrollable/input/touchable members are the real RN components (the
            // library's own mock does the same), so their content renders and they
            // behave under test.
            BottomSheetScrollView: createScrollViewMock(React),
            BottomSheetFlatList: createFlatListMock(React),
            BottomSheetSectionList: createSectionListMock(React),
            BottomSheetVirtualizedList: createVirtualizedListMock(React),
            BottomSheetFlashList: createFlatListMock(React),
            BottomSheetTextInput: createTextInputMock(React),
            TouchableOpacity: createTouchableOpacityMock(React),
            TouchableHighlight: createTouchableHighlightMock(React),
            TouchableWithoutFeedback: createTouchableWithoutFeedbackMock(React),
            useBottomSheet: () => ({
              ...sheetMethods,
              animatedIndex: { value: 0 },
              animatedPosition: { value: 0 },
            }),
            useBottomSheetModal: () => ({ dismiss: vi.fn(), dismissAll: vi.fn() }),
            useBottomSheetInternal: () => ({}),
            useBottomSheetModalInternal: () => ({}),
            // Config helpers return their input unchanged in the real library.
            useBottomSheetSpringConfigs: (config: unknown) => config,
            useBottomSheetTimingConfigs: (config: unknown) => config,
            // Retained for back-compat (the library's own mock keeps it too).
            useBottomSheetDynamicSnapPoints: () => ({
              animatedHandleHeight: { value: 0 },
              animatedSnapPoints: { value: [] },
              animatedContentHeight: { value: 0 },
              handleContentLayout: vi.fn(),
            }),
            createBottomSheetScrollableComponent: vi.fn(() => createScrollViewMock(React)),
            enableLogging: vi.fn(),
            ...constants,
            ...bottomSheetAdditions(React, createScrollViewMock(React)),
          };
        },
      }),
    },
  });
}
