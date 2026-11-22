import { hosts } from "../host-classes.js";

export function createViewMock(React: typeof import("react")) {
  const { hostComponent } = hosts(React);
  const View = React.forwardRef((props: any, ref: any) => {
    return React.createElement(hostComponent("View"), { ...props, ref });
  });
  View.displayName = "View";
  return View;
}
