import React from "react";

export function createTextMock() {
  const Text = React.forwardRef((props: any, ref: any) => {
    return React.createElement("Text", { ...props, ref });
  });
  Text.displayName = "Text";
  return Text;
}
