import React from "react";
import { hostComponent } from "../host.js";

export function createInputAccessoryViewMock() {
  const InputAccessoryView = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("InputAccessoryView"), { ...props, ref });
  });
  InputAccessoryView.displayName = "InputAccessoryView";
  return InputAccessoryView;
}
