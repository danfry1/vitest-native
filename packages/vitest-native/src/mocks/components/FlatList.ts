import React from "react";
import { vi } from "vitest";

export function createFlatListMock() {
  const FlatList = React.forwardRef((props: any, ref: any) => {
    const {
      data,
      renderItem,
      keyExtractor,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      ItemSeparatorComponent,
      refreshControl,
      ...rest
    } = props;

    const instanceMethods = {
      scrollToEnd: vi.fn(),
      scrollToIndex: vi.fn(),
      scrollToItem: vi.fn(),
      scrollToOffset: vi.fn(),
      recordInteraction: vi.fn(),
      flashScrollIndicators: vi.fn(),
      getScrollResponder: vi.fn(() => ({})),
      getNativeScrollRef: vi.fn(),
      getScrollableNode: vi.fn(),
      setNativeProps: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    const children: any[] = [];

    if (ListHeaderComponent) {
      children.push(
        React.createElement(
          "FlatList-Header",
          { key: "__header" },
          typeof ListHeaderComponent === "function"
            ? React.createElement(ListHeaderComponent)
            : ListHeaderComponent,
        ),
      );
    }

    if (data && data.length > 0) {
      data.forEach((item: any, index: number) => {
        const key = keyExtractor ? keyExtractor(item, index) : String(index);
        children.push(
          React.createElement(
            React.Fragment,
            { key },
            renderItem({
              item,
              index,
              separators: { highlight: vi.fn(), unhighlight: vi.fn(), updateProps: vi.fn() },
            }),
          ),
        );
        if (ItemSeparatorComponent && index < data.length - 1) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `separator-${index}` },
              typeof ItemSeparatorComponent === "function"
                ? React.createElement(ItemSeparatorComponent)
                : ItemSeparatorComponent,
            ),
          );
        }
      });
    } else if (ListEmptyComponent) {
      children.push(
        React.createElement(
          "FlatList-Empty",
          { key: "__empty" },
          typeof ListEmptyComponent === "function"
            ? React.createElement(ListEmptyComponent)
            : ListEmptyComponent,
        ),
      );
    }

    if (ListFooterComponent) {
      children.push(
        React.createElement(
          "FlatList-Footer",
          { key: "__footer" },
          typeof ListFooterComponent === "function"
            ? React.createElement(ListFooterComponent)
            : ListFooterComponent,
        ),
      );
    }

    if (refreshControl) {
      children.unshift(refreshControl);
    }

    return React.createElement("FlatList", { ...rest, ref }, ...children);
  });
  FlatList.displayName = "FlatList";
  return FlatList;
}
