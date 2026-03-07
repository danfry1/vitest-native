import React from "react";

export function createButtonMock() {
  function Button(props: any) {
    const { title, onPress, disabled, color, accessibilityLabel, testID, ...rest } = props;
    return React.createElement(
      "View",
      { ...rest, testID },
      React.createElement(
        "Text",
        {
          onPress: disabled ? undefined : onPress,
          accessibilityLabel: accessibilityLabel || title,
          accessibilityRole: "button",
          disabled,
          style: color ? { color } : undefined,
        },
        title,
      ),
    );
  }
  Button.displayName = "Button";
  return Button;
}
