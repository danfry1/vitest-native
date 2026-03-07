import React from "react";

export function createTouchableOpacityMock() {
  const TouchableOpacity = React.forwardRef((props: any, ref: any) => {
    return React.createElement("TouchableOpacity", { ...props, ref });
  });
  TouchableOpacity.displayName = "TouchableOpacity";
  return TouchableOpacity;
}
