import React from "react";

export function createInputAccessoryViewMock() {
  const InputAccessoryView = React.forwardRef((props: any, ref: any) => {
    return React.createElement("InputAccessoryView", { ...props, ref });
  });
  InputAccessoryView.displayName = "InputAccessoryView";
  return InputAccessoryView;
}
