import React from "react";

export function createDrawerLayoutAndroidMock() {
  const DrawerLayoutAndroid = React.forwardRef((props: any, ref: any) => {
    const { children, ...rest } = props;
    return React.createElement("DrawerLayoutAndroid", { ...rest, ref }, children);
  });
  DrawerLayoutAndroid.displayName = "DrawerLayoutAndroid";
  return DrawerLayoutAndroid;
}
