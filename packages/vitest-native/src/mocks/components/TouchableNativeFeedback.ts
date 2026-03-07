import React from "react";

export function createTouchableNativeFeedbackMock() {
  const TouchableNativeFeedback = React.forwardRef((props: any, ref: any) => {
    return React.createElement("TouchableNativeFeedback", { ...props, ref });
  });
  TouchableNativeFeedback.displayName = "TouchableNativeFeedback";
  return TouchableNativeFeedback;
}
