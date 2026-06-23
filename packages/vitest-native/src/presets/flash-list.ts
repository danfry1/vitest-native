import type { Preset } from "../types.js";
import React from "react";

// @shopify/flash-list is a FlatList-replacement backed by a native recycler that
// can't run in Node. Shadow it with a list that actually renders its data through
// renderItem (so queries like getByText find list rows), plus the imperative ref
// surface real code calls. Mirrors how Jest suites mock FlashList.
export function flashList(): Preset {
  return {
    name: "flashList",
    modules: {
      "@shopify/flash-list": {
        exports: ["FlashList", "MasonryFlashList", "AnimatedFlashList"],
        factory: () => {
          const renderElement = (Component: any) => {
            if (Component == null) return null;
            if (React.isValidElement(Component)) return Component;
            return React.createElement(Component);
          };

          function createFlashList(name: string) {
            const List = React.forwardRef((props: any, ref: any) => {
              const {
                data,
                renderItem,
                keyExtractor,
                extraData,
                ListHeaderComponent,
                ListFooterComponent,
                ListEmptyComponent,
                ...rest
              } = props;

              React.useImperativeHandle(ref, () => ({
                scrollToEnd: () => {},
                scrollToIndex: () => {},
                scrollToItem: () => {},
                scrollToOffset: () => {},
                recordInteraction: () => {},
                recomputeViewableItems: () => {},
                prepareForLayoutAnimationRender: () => {},
                getScrollableNode: () => null,
              }));

              const items = Array.isArray(data) ? data : [];
              const rows =
                items.length === 0
                  ? renderElement(ListEmptyComponent)
                  : items.map((item: any, index: number) => {
                      const element = renderItem
                        ? renderItem({ item, index, extraData, target: "Cell" })
                        : null;
                      if (element == null) return null;
                      const key = keyExtractor ? keyExtractor(item, index) : String(index);
                      return React.createElement(React.Fragment, { key }, element);
                    });

              return React.createElement(
                name,
                rest,
                renderElement(ListHeaderComponent),
                rows,
                renderElement(ListFooterComponent),
              );
            });
            List.displayName = name;
            return List;
          }

          const FlashList = createFlashList("FlashList");
          return {
            __esModule: true,
            default: FlashList,
            FlashList,
            MasonryFlashList: createFlashList("MasonryFlashList"),
            AnimatedFlashList: createFlashList("AnimatedFlashList"),
          };
        },
      },
    },
  };
}
