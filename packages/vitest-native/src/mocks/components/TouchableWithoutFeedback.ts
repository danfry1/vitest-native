import { hosts } from "../host-classes.js";
import { buildPressableHostProps } from "./pressableHost.js";

export function createTouchableWithoutFeedbackMock(React: typeof import("react")) {
  const { hostComponent } = hosts(React);
  const TouchableWithoutFeedback = React.forwardRef((props: any, ref: any) =>
    React.createElement(
      hostComponent("TouchableWithoutFeedback"),
      buildPressableHostProps(props, ref),
    ),
  );
  TouchableWithoutFeedback.displayName = "TouchableWithoutFeedback";
  return TouchableWithoutFeedback;
}
