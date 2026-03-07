import React from "react";

export function createTouchableWithoutFeedbackMock() {
  const TouchableWithoutFeedback = React.forwardRef((props: any, ref: any) => {
    return React.createElement("TouchableWithoutFeedback", { ...props, ref });
  });
  TouchableWithoutFeedback.displayName = "TouchableWithoutFeedback";
  return TouchableWithoutFeedback;
}
