import React from "react";

export function createKeyboardAvoidingViewMock() {
  const KeyboardAvoidingView = React.forwardRef((props: any, ref: any) => {
    return React.createElement("KeyboardAvoidingView", { ...props, ref });
  });
  KeyboardAvoidingView.displayName = "KeyboardAvoidingView";
  return KeyboardAvoidingView;
}
