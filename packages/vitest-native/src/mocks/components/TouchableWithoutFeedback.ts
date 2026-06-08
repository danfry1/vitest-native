import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableWithoutFeedbackMock() {
  const TouchableWithoutFeedback = React.forwardRef((props: any, ref: any) =>
    React.createElement("TouchableWithoutFeedback", buildPressableHostProps(props, ref)),
  );
  TouchableWithoutFeedback.displayName = "TouchableWithoutFeedback";
  return TouchableWithoutFeedback;
}
