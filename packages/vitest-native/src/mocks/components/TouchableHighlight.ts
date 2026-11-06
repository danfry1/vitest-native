import React from "react";
import { hostComponent } from "../host.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableHighlightMock() {
  const TouchableHighlight = React.forwardRef((props: any, ref: any) =>
    React.createElement(hostComponent("TouchableHighlight"), buildPressableHostProps(props, ref)),
  );
  TouchableHighlight.displayName = "TouchableHighlight";
  return TouchableHighlight;
}
