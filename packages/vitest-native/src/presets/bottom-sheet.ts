import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

// @gorhom/bottom-sheet renders through reanimated worklets + gesture-handler
// natives that can't run in Node. Shadow it the way the library's own
// `@gorhom/bottom-sheet/mock` does: every container renders its children through
// real RN (so content is always queryable — the real sheet is collapsed by
// default), the imperative refs are no-ops, and the hooks return inert handles.
export function bottomSheet(): Preset {
  return {
    name: "bottomSheet",
    modules: {
      "@gorhom/bottom-sheet": {
        exports: [
          "BottomSheetModal",
          "BottomSheetView",
          "BottomSheetScrollView",
          "BottomSheetFlatList",
          "BottomSheetSectionList",
          "BottomSheetVirtualizedList",
          "BottomSheetTextInput",
          "BottomSheetBackdrop",
          "BottomSheetFooter",
          "BottomSheetHandle",
          "BottomSheetDraggableView",
          "BottomSheetModalProvider",
          "useBottomSheet",
          "useBottomSheetModal",
          "useBottomSheetSpringConfigs",
          "useBottomSheetTimingConfigs",
          "useBottomSheetInternal",
          "useBottomSheetDynamicSnapPoints",
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
          const modalMethods = {
            ...sheetMethods,
            present: () => {},
            dismiss: () => {},
          };

          // List variants render their data through renderItem so rows stay
          // queryable (matching the FlatList/ScrollView the real sheet hosts).
          function dataList(name: string) {
            const List = React.forwardRef((props: any, ref: any) => {
              const { data, renderItem, keyExtractor, ...rest } = props;
              React.useImperativeHandle(ref, () => sheetMethods);
              const items = Array.isArray(data) ? data : [];
              const rows = items.map((item: any, index: number) => {
                const element = renderItem ? renderItem({ item, index }) : null;
                if (element == null) return null;
                const key = keyExtractor ? keyExtractor(item, index) : String(index);
                return React.createElement(React.Fragment, { key }, element);
              });
              return React.createElement(name, rest, rows, rest.children);
            });
            List.displayName = name;
            return List;
          }

          const BottomSheet = container("BottomSheet", sheetMethods);
          const BottomSheetModal = container("BottomSheetModal", modalMethods);

          return {
            __esModule: true,
            default: BottomSheet,
            BottomSheetModal,
            BottomSheetView: container("BottomSheetView"),
            BottomSheetScrollView: container("BottomSheetScrollView"),
            BottomSheetFlatList: dataList("BottomSheetFlatList"),
            BottomSheetSectionList: container("BottomSheetSectionList"),
            BottomSheetVirtualizedList: dataList("BottomSheetVirtualizedList"),
            BottomSheetTextInput: container("BottomSheetTextInput"),
            BottomSheetBackdrop: container("BottomSheetBackdrop"),
            BottomSheetFooter: container("BottomSheetFooter"),
            BottomSheetHandle: container("BottomSheetHandle"),
            BottomSheetDraggableView: container("BottomSheetDraggableView"),
            BottomSheetModalProvider: container("BottomSheetModalProvider"),
            useBottomSheet: () => ({
              ...sheetMethods,
              animatedIndex: { value: 0 },
              animatedPosition: { value: 0 },
            }),
            useBottomSheetModal: () => ({ dismiss: vi.fn(), dismissAll: vi.fn() }),
            // Config helpers return their input unchanged in the real library.
            useBottomSheetSpringConfigs: (config: unknown) => config,
            useBottomSheetTimingConfigs: (config: unknown) => config,
            useBottomSheetInternal: () => ({}),
            useBottomSheetDynamicSnapPoints: () => ({
              animatedHandleHeight: { value: 0 },
              animatedSnapPoints: { value: [] },
              animatedContentHeight: { value: 0 },
              handleContentLayout: vi.fn(),
            }),
          };
        },
      },
    },
  };
}
