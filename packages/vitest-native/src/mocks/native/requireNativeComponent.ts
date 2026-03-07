import React from "react";

export function createRequireNativeComponentMock() {
  return function requireNativeComponent(viewName: string) {
    const Component = React.forwardRef((props: any, ref: any) => {
      return React.createElement(viewName, { ...props, ref });
    });
    Component.displayName = viewName;
    return Component;
  };
}
