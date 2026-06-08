import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

export function createButtonMock() {
  function Button(props: any) {
    const { title, onPress, disabled, color, accessibilityLabel, accessibilityState, ...rest } =
      props;
    // Real RN Button wraps a Touchable, so it must opt into the responder system —
    // otherwise RNTL's userEvent.press never fires onPress (it drives the responder
    // sequence, not a direct press). Route through the shared press-host builder
    // (responder wiring + disabled → accessibilityState), then add Button's own
    // role/label. The Text child carries the title.
    const hostProps = buildPressableHostProps(
      {
        ...rest,
        onPress,
        disabled,
        accessibilityState,
        accessibilityLabel: accessibilityLabel || title,
        accessibilityRole: "button",
      },
      undefined,
    );
    return React.createElement(
      "View",
      hostProps,
      React.createElement("Text", { style: color ? { color } : undefined, disabled }, title),
    );
  }
  Button.displayName = "Button";
  return Button;
}
