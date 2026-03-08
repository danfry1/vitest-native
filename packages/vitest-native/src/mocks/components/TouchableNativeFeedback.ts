import React from "react";

export function createTouchableNativeFeedbackMock() {
  const TouchableNativeFeedback = React.forwardRef((props: any, ref: any) => {
    const { disabled, accessibilityState, ...rest } = props;
    const mergedA11yState =
      disabled || accessibilityState
        ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
        : undefined;
    return React.createElement("TouchableNativeFeedback", {
      accessible: true,
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  TouchableNativeFeedback.displayName = "TouchableNativeFeedback";
  return TouchableNativeFeedback;
}
