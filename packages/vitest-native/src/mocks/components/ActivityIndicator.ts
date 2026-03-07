import React from "react";

export function createActivityIndicatorMock() {
  const ActivityIndicator = React.forwardRef((props: any, ref: any) => {
    return React.createElement("ActivityIndicator", { ...props, ref });
  });
  ActivityIndicator.displayName = "ActivityIndicator";
  return ActivityIndicator;
}
