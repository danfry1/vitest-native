import React from "react";
import { buildPressableHostProps } from "./pressableHost.js";

export function createPressableMock() {
  const Pressable = React.forwardRef((props: any, ref: any) =>
    React.createElement("Pressable", buildPressableHostProps(props, ref)),
  );
  Pressable.displayName = "Pressable";
  return Pressable;
}
