import React from "react";

export function createTouchableOpacityMock() {
  const TouchableOpacity = React.forwardRef((props: any, ref: any) => {
    const { disabled, accessibilityState, ...rest } = props;
    const mergedA11yState =
      disabled || accessibilityState
        ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
        : undefined;
    return React.createElement("TouchableOpacity", {
      accessible: true,
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  TouchableOpacity.displayName = "TouchableOpacity";
  return TouchableOpacity;
}
