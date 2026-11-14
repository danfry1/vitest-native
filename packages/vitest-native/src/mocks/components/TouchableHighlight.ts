import { hosts } from "../host-classes.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableHighlightMock(React: typeof import("react")) {
  const { hostComponent } = hosts(React);
  const TouchableHighlight = React.forwardRef((props: any, ref: any) =>
    React.createElement(hostComponent("TouchableHighlight"), buildPressableHostProps(props, ref)),
  );
  TouchableHighlight.displayName = "TouchableHighlight";
  return TouchableHighlight;
}
