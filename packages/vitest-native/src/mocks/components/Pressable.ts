import React from "react";

export function createPressableMock() {
  const Pressable = React.forwardRef((props: any, ref: any) => {
    return React.createElement("Pressable", { ...props, ref });
  });
  Pressable.displayName = "Pressable";
  return Pressable;
}
