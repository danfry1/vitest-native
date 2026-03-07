import React from "react";
import { vi } from "vitest";

export function createScrollViewMock() {
  const ScrollView = React.forwardRef((props: any, ref: any) => {
    const instanceMethods = {
      scrollTo: vi.fn(),
      scrollToEnd: vi.fn(),
      flashScrollIndicators: vi.fn(),
      getScrollResponder: vi.fn(() => ({})),
      getInnerViewNode: vi.fn(),
      setNativeProps: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    return React.createElement("ScrollView", { ...props, ref });
  });
  ScrollView.displayName = "ScrollView";
  return ScrollView;
}
