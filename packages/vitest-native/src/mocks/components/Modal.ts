import React from "react";

export function createModalMock() {
  const Modal = React.forwardRef((props: any, ref: any) => {
    const { visible = true, children, ...rest } = props;
    // A freshly-rendered Modal with visible={false} renders nothing queryable —
    // this matches real RN under react-test-renderer (verified by the cross-check:
    // hidden → child not queryable). (Note: real RN's toBeVisible semantics for
    // Modal children are quirky and RN/RNTL-version-specific, so the cross-check
    // probes Modal by queryability, not toBeVisible.)
    if (!visible) return null;
    return React.createElement("Modal", { ...rest, visible, ref }, children);
  });
  Modal.displayName = "Modal";
  return Modal;
}
