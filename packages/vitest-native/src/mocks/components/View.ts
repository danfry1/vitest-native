import React from "react";
import { hostComponent } from "../host.js";

export function createViewMock() {
  const View = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("View"), { ...props, ref });
  });
  View.displayName = "View";
  return View;
}
