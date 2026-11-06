import React from "react";
import { hostComponent } from "../host.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableWithoutFeedbackMock() {
  const TouchableWithoutFeedback = React.forwardRef((props: any, ref: any) =>
    React.createElement(
      hostComponent("TouchableWithoutFeedback"),
      buildPressableHostProps(props, ref),
    ),
  );
  TouchableWithoutFeedback.displayName = "TouchableWithoutFeedback";
  return TouchableWithoutFeedback;
}
