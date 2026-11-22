import React from "react";
import { hostComponent } from "../host.js";

export function createActivityIndicatorMock() {
  const ActivityIndicator = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("ActivityIndicator"), { ...props, ref });
  });
  ActivityIndicator.displayName = "ActivityIndicator";
  return ActivityIndicator;
}
