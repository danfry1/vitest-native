import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableHighlightMock() {
  const TouchableHighlight = React.forwardRef((props: any, ref: any) =>
    React.createElement("TouchableHighlight", buildPressableHostProps(props, ref)),
  );
  TouchableHighlight.displayName = "TouchableHighlight";
  return TouchableHighlight;
}
