import React from "react";
import { vi } from "vitest";

export function createVirtualizedListMock() {
  const VirtualizedList = React.forwardRef((props: any, ref: any) => {
    const {
      data,
      renderItem,
      keyExtractor,
      getItemCount,
      getItem,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
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
          "VirtualizedList-Header",
          { key: "__header" },
          typeof ListHeaderComponent === "function"
            ? React.createElement(ListHeaderComponent)
            : ListHeaderComponent,
        ),
      );
    }

    const itemCount = getItemCount ? getItemCount(data) : data ? data.length : 0;

    if (itemCount > 0) {
      for (let index = 0; index < itemCount; index++) {
        const item = getItem ? getItem(data, index) : data[index];
        const key = keyExtractor ? keyExtractor(item, index) : String(index);
        children.push(
          React.createElement(React.Fragment, { key }, renderItem({ item, index, separators: {} })),
        );
      }
    } else if (ListEmptyComponent) {
      children.push(
        React.createElement(
          "VirtualizedList-Empty",
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
          "VirtualizedList-Footer",
          { key: "__footer" },
          typeof ListFooterComponent === "function"
            ? React.createElement(ListFooterComponent)
            : ListFooterComponent,
        ),
      );
    }

    return React.createElement("VirtualizedList", { ...rest, ref }, ...children);
  });
  VirtualizedList.displayName = "VirtualizedList";
  return VirtualizedList;
}
