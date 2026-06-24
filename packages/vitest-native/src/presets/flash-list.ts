import type { Preset } from "../types.js";
import React from "react";

// @shopify/flash-list (v2) is a FlatList-replacement backed by a native recycler
// that can't run in Node. Shadow it with a list that actually renders its data
// through renderItem (so rows stay queryable), the imperative ref surface, and the
// v2 recycler hooks (`useRecyclingState` etc.) real code calls — those resolve to
// `undefined` without a shadow and throw when invoked.
export function flashList(): Preset {
  return {
    name: "flashList",
    modules: {
      "@shopify/flash-list": {
        exports: [
          "FlashList",
          "AnimatedFlashList",
          "LayoutCommitObserver",
          "ViewToken",
          "RenderTargetOptions",
          "useRecyclingState",
          "useLayoutState",
          "useMappingHelper",
          "useFlashListContext",
          "useBenchmark",
        ],
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
                scrollToTop: () => {},
                flashScrollIndicators: () => {},
                recordInteraction: () => {},
                recomputeViewableItems: () => {},
                prepareForLayoutAnimationRender: () => {},
                getScrollableNode: () => null,
                getNativeScrollRef: () => null,
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

          const LayoutCommitObserver = React.forwardRef((props: any, ref: any) =>
            React.createElement("LayoutCommitObserver", { ...props, ref }, props.children),
          );
          LayoutCommitObserver.displayName = "LayoutCommitObserver";

          return {
            __esModule: true,
            default: FlashList,
            FlashList,
            AnimatedFlashList: createFlashList("AnimatedFlashList"),
            LayoutCommitObserver,
            // The v2 render-target enum (a real runtime value, not just a type).
            RenderTargetOptions: {
              Cell: "Cell",
              StickyHeader: "StickyHeader",
              Measurement: "Measurement",
            },
            // ViewToken is a type at compile time; an inert value satisfies any runtime ref.
            ViewToken: function ViewToken() {},
            // v2 recycler hooks. The state hooks behave like useState so a component
            // reading/updating recycling state renders and re-renders normally.
            useRecyclingState: (initialState: any) => React.useState(initialState),
            useLayoutState: (initialState: any) => React.useState(initialState),
            useMappingHelper: () => ({
              getMappingKey: (_item: any, index: number) => String(index),
            }),
            useFlashListContext: () => undefined,
            useBenchmark: () => {},
          };
        },
      },
    },
  };
}
