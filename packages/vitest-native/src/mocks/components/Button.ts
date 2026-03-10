import React from "react";

export function createButtonMock() {
  function Button(props: any) {
    const {
      title,
      onPress,
      disabled,
      color,
      accessibilityLabel,
      accessibilityState,
      testID,
      ...rest
    } = props;
    // Real RN Button wraps in TouchableOpacity (iOS) / TouchableNativeFeedback (Android).
    // The Touchable suppresses onPress when disabled. Since our mock uses a plain View,
    // we guard onPress ourselves to match the real behavior.
    return React.createElement(
      "View",
      {
        ...rest,
        testID,
        onPress: disabled ? undefined : onPress,
        accessibilityLabel: accessibilityLabel || title,
        accessibilityRole: "button",
        accessibilityState: disabled
          ? { ...accessibilityState, disabled: true }
          : accessibilityState,
        accessible: true,
        disabled,
      },
      React.createElement(
        "Text",
        {
          style: color ? { color } : undefined,
          disabled,
        },
        title,
      ),
    );
  }
  Button.displayName = "Button";
  return Button;
}
