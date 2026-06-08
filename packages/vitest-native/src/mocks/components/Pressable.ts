import React from "react";

export function createPressableMock() {
  const Pressable = React.forwardRef((props: any, ref: any) => {
    const { disabled, accessibilityState, onPress, onPressIn, onPressOut, onLongPress, ...rest } =
      props;
    // Match real RN: Pressable is accessible by default, and
    // translates `disabled` prop into accessibilityState.
    const mergedA11yState =
      disabled || accessibilityState
        ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
        : undefined;

    // Responder wiring so RNTL's `userEvent.press(...)` fires onPress. userEvent
    // drives a press by dispatching the responder sequence (responderGrant →
    // responderRelease), NOT a direct `press` event — exactly how a real device
    // works, and how real RN Pressable translates touches into onPress. The mock
    // must therefore (a) claim the responder via onStartShouldSetResponder, and
    // (b) translate grant/release into onPressIn / onPress + onPressOut. We ALSO
    // keep onPress directly on the host so the simpler `fireEvent.press(...)` (which
    // invokes the onPress prop) keeps working. Disabled Pressables claim nothing,
    // matching real RN (so neither userEvent nor fireEvent fires).
    const pressProps = disabled
      ? {}
      : {
          onStartShouldSetResponder: () => true,
          onResponderGrant: (e: any) => onPressIn?.(e),
          onResponderRelease: (e: any) => {
            onPress?.(e);
            onPressOut?.(e);
          },
          onPress,
          onPressIn,
          onPressOut,
          onLongPress,
        };

    return React.createElement("Pressable", {
      accessible: true,
      ...pressProps,
      ...rest,
      ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
      ref,
    });
  });
  Pressable.displayName = "Pressable";
  return Pressable;
}
