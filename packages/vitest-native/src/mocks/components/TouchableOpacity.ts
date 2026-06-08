import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableOpacityMock() {
  const TouchableOpacity = React.forwardRef((props: any, ref: any) =>
    React.createElement("TouchableOpacity", buildPressableHostProps(props, ref)),
  );
  TouchableOpacity.displayName = "TouchableOpacity";
  return TouchableOpacity;
}
