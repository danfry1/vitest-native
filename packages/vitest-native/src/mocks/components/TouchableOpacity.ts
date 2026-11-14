import { hosts } from "../host-classes.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableOpacityMock(React: typeof import("react")) {
  const { hostComponent } = hosts(React);
  const TouchableOpacity = React.forwardRef((props: any, ref: any) =>
    React.createElement(hostComponent("TouchableOpacity"), buildPressableHostProps(props, ref)),
  );
  TouchableOpacity.displayName = "TouchableOpacity";
  return TouchableOpacity;
}
