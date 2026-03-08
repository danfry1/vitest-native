import React from "react";

export function createPressableMock() {
  const Pressable = React.forwardRef((props: any, ref: any) => {
    const { disabled, accessibilityState, ...rest } = props;
    // Match real RN: Pressable is accessible by default, and
    // translates `disabled` prop into accessibilityState.
    const mergedA11yState =
      disabled || accessibilityState
        ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
        : undefined;
    return React.createElement("Pressable", {
      accessible: true,
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  Pressable.displayName = "Pressable";
  return Pressable;
}
