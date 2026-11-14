import { vi } from "vitest";

export function createScrollViewMock(React: typeof import("react")) {
  const ScrollView = React.forwardRef((props: any, ref: any) => {
    const { children, refreshControl, ...rest } = props;
    const instanceMethods = {
      scrollTo: vi.fn(),
      scrollToEnd: vi.fn(),
      flashScrollIndicators: vi.fn(),
      getScrollResponder: vi.fn(() => ({})),
      getInnerViewNode: vi.fn(),
      setNativeProps: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    return React.createElement(
      // The ref is the handle above; the host takes none.
      "RCTScrollView",
      rest,
      refreshControl,
      React.createElement("View", null, children),
    );
  });
  ScrollView.displayName = "ScrollView";
  return ScrollView;
}
