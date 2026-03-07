import React from "react";

export function createSafeAreaViewMock() {
  const SafeAreaView = React.forwardRef((props: any, ref: any) => {
    return React.createElement("SafeAreaView", { ...props, ref });
  });
  SafeAreaView.displayName = "SafeAreaView";
  return SafeAreaView;
}
