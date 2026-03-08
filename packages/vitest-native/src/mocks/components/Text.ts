import React from "react";

export function createTextMock() {
  const Text = React.forwardRef((props: any, ref: any) => {
    const { onPress, onLongPress, disabled, accessibilityRole, ...rest } = props;
    const isPressable = !disabled && (onPress || onLongPress);
    const resolvedRole =
      accessibilityRole ?? (isPressable ? "link" : undefined);

    return React.createElement("Text", {
      accessible: true,
      ...rest,
      ...(onPress ? { onPress } : {}),
      ...(onLongPress ? { onLongPress } : {}),
      ...(disabled ? { disabled } : {}),
      ...(resolvedRole ? { accessibilityRole: resolvedRole } : {}),
      ref,
    });
  });
  Text.displayName = "Text";
  return Text;
}
