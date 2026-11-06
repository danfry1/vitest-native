import React from "react";
import { hostComponent } from "../host.js";

export function createDrawerLayoutAndroidMock() {
  const DrawerLayoutAndroid = React.forwardRef((props: any, ref: any) => {
    const { children, ...rest } = props;
    return React.createElement(hostComponent("DrawerLayoutAndroid"), { ...rest, ref }, children);
  });
  DrawerLayoutAndroid.displayName = "DrawerLayoutAndroid";
  return DrawerLayoutAndroid;
}
