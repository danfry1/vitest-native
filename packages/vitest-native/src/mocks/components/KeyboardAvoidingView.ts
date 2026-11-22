import React from "react";
import { hostComponent } from "../host.js";

export function createKeyboardAvoidingViewMock() {
  const KeyboardAvoidingView = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("KeyboardAvoidingView"), { ...props, ref });
  });
  KeyboardAvoidingView.displayName = "KeyboardAvoidingView";
  return KeyboardAvoidingView;
}
