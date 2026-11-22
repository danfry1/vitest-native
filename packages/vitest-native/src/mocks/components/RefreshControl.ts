import React from "react";
import { hostComponent } from "../host.js";

export function createRefreshControlMock() {
  const RefreshControl = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("RefreshControl"), { ...props, ref });
  });
  RefreshControl.displayName = "RefreshControl";
  return RefreshControl;
}
