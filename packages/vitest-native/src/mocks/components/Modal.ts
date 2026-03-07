import React from "react";

export function createModalMock() {
  const Modal = React.forwardRef((props: any, ref: any) => {
    const { visible = true, children, ...rest } = props;
    if (!visible) return null;
    return React.createElement("Modal", { ...rest, visible, ref }, children);
  });
  Modal.displayName = "Modal";
  return Modal;
}
