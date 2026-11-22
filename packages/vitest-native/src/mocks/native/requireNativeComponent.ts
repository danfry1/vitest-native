import React from "react";
import { hostComponent } from "../host.js";

export function createRequireNativeComponentMock() {
  return function requireNativeComponent(viewName: string) {
    const Component = React.forwardRef((props: any, ref: any) => {
      return React.createElement(hostComponent(viewName), { ...props, ref });
    });
    Component.displayName = viewName;
    return Component;
  };
}
