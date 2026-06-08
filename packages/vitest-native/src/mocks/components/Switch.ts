import React from "react";

export function createSwitchMock() {
  const Switch = React.forwardRef((props: any, ref: any) => {
    // Real RN Switch exposes accessibilityRole "switch" (RNTL's getByRole('switch')
    // and role assertions depend on it) — caught missing by the cross-check.
    return React.createElement("RCTSwitch", { accessibilityRole: "switch", ...props, ref });
  });
  Switch.displayName = "Switch";
  return Switch;
}
