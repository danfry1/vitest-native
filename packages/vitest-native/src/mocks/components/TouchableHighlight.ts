import React from "react";

export function createTouchableHighlightMock() {
  const TouchableHighlight = React.forwardRef((props: any, ref: any) => {
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
    return React.createElement("TouchableHighlight", {
      accessible: true,
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  TouchableHighlight.displayName = "TouchableHighlight";
  return TouchableHighlight;
}
