import React from "react";

export function createViewMock() {
  const View = React.forwardRef((props: any, ref: any) => {
    return React.createElement("View", { ...props, ref });
  });
  View.displayName = "View";
  return View;
}
