import React from "react";

export function createSwitchMock() {
  const Switch = React.forwardRef((props: any, ref: any) => {
    return React.createElement("RCTSwitch", { ...props, ref });
  });
  Switch.displayName = "Switch";
  return Switch;
}
