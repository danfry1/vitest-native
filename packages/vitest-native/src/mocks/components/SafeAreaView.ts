import React from "react";
import { hostComponent } from "../host.js";

export function createSafeAreaViewMock() {
  const SafeAreaView = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("SafeAreaView"), { ...props, ref });
  });
  SafeAreaView.displayName = "SafeAreaView";
  return SafeAreaView;
}
