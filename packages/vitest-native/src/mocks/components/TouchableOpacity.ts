import React from "react";
import { hostComponent } from "../host.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableOpacityMock() {
  const TouchableOpacity = React.forwardRef((props: any, ref: any) =>
    React.createElement(hostComponent("TouchableOpacity"), buildPressableHostProps(props, ref)),
  );
  TouchableOpacity.displayName = "TouchableOpacity";
  return TouchableOpacity;
}
