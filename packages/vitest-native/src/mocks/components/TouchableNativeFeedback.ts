import React from "react";
import { hostComponent } from "../host.js";

export function createTouchableNativeFeedbackMock() {
  const TouchableNativeFeedback = React.forwardRef((props: any, ref: any) => {
    const { disabled, accessibilityState, ...rest } = props;
    const mergedA11yState =
      disabled || accessibilityState
        ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
        : undefined;
    if (disabled) {
      delete rest.onPress;
      delete rest.onPressIn;
      delete rest.onPressOut;
      delete rest.onLongPress;
    }
    return React.createElement(hostComponent("TouchableNativeFeedback"), {
      accessible: true,
      // See pressableHost.ts: disabled must block press under RNTL >=14.
      ...(disabled ? { pointerEvents: "none" } : {}),
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  TouchableNativeFeedback.displayName = "TouchableNativeFeedback";
  return TouchableNativeFeedback;
}
