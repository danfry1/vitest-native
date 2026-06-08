// Shared host-prop builder for the press-responder components — Pressable and the
// Touchable* family. They all need the same wiring so RNTL's recommended
// `userEvent.press(...)` actually fires onPress:
//
// userEvent drives a press through the responder sequence (responderGrant →
// responderRelease), NOT a direct `press` event — exactly like a real device, and
// how real RN translates touches into onPress. So the host must (a) claim the
// responder via `onStartShouldSetResponder`, and (b) translate grant/release into
// onPressIn / onPress + onPressOut. We ALSO keep onPress directly on the host so the
// simpler `fireEvent.press(...)` (which invokes the onPress prop) keeps working.
//
// Disabled components claim nothing and carry no press handlers — matching real RN,
// so neither userEvent nor fireEvent fires. `disabled` is also folded into
// accessibilityState (what RNTL's toBeDisabled / byRole rely on).
export function buildPressableHostProps(props: any, ref: any): Record<string, any> {
  const { disabled, accessibilityState, onPress, onPressIn, onPressOut, onLongPress, ...rest } =
    props;

  const mergedA11yState =
    disabled || accessibilityState
      ? { ...accessibilityState, ...(disabled ? { disabled: true } : {}) }
      : undefined;

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

  return {
    accessible: true,
    ...pressProps,
    ...rest,
    ...(mergedA11yState ? { accessibilityState: mergedA11yState } : {}),
    ref,
  };
}
