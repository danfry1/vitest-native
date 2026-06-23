import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createTextInputMock } from "../mocks/components/TextInput.js";
import { createScrollViewMock } from "../mocks/components/ScrollView.js";
import { createFlatListMock } from "../mocks/components/FlatList.js";
import { createSectionListMock } from "../mocks/components/SectionList.js";
import { createVirtualizedListMock } from "../mocks/components/VirtualizedList.js";
import { createTouchableOpacityMock } from "../mocks/components/TouchableOpacity.js";
import { createTouchableHighlightMock } from "../mocks/components/TouchableHighlight.js";
import { createTouchableWithoutFeedbackMock } from "../mocks/components/TouchableWithoutFeedback.js";

// @gorhom/bottom-sheet renders through reanimated worklets + gesture-handler
// natives that can't run in Node. Shadow it the way the library's own
// `@gorhom/bottom-sheet/mock` does: the scrollable/input/touchable members are the
// corresponding real React Native components (so their content is queryable and
// they behave — changeText, list rows, …), the sheet containers render their
// children with no-op imperative refs, and the constants/hooks are re-exported.
export function bottomSheet(): Preset {
  return {
    name: "bottomSheet",
    modules: {
      "@gorhom/bottom-sheet": {
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
        factory: () => {
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
            SHEET_STATE: { CLOSED: 0, OPENED: 1, EXTENDED: 2 },
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
            ANIMATION_SOURCE: { NONE: 0, MOUNT: 1, GESTURE: 2, USER: 3, KEYBOARD: 6 },
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
            BottomSheetScrollView: createScrollViewMock(),
            BottomSheetFlatList: createFlatListMock(),
            BottomSheetSectionList: createSectionListMock(),
            BottomSheetVirtualizedList: createVirtualizedListMock(),
            BottomSheetFlashList: createFlatListMock(),
            BottomSheetTextInput: createTextInputMock(),
            TouchableOpacity: createTouchableOpacityMock(),
            TouchableHighlight: createTouchableHighlightMock(),
            TouchableWithoutFeedback: createTouchableWithoutFeedbackMock(),
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
            createBottomSheetScrollableComponent: vi.fn(() => createScrollViewMock()),
            enableLogging: vi.fn(),
            ...constants,
          };
        },
      },
    },
  };
}
