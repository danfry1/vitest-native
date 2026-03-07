import React from "react";

export function createTouchableHighlightMock() {
  const TouchableHighlight = React.forwardRef((props: any, ref: any) => {
    return React.createElement("TouchableHighlight", { ...props, ref });
  });
  TouchableHighlight.displayName = "TouchableHighlight";
  return TouchableHighlight;
}
