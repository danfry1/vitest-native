import React from "react";

export function createRefreshControlMock() {
  const RefreshControl = React.forwardRef((props: any, ref: any) => {
    return React.createElement("RefreshControl", { ...props, ref });
  });
  RefreshControl.displayName = "RefreshControl";
  return RefreshControl;
}
