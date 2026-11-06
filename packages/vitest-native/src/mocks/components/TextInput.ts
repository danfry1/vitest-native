import React from "react";
import { vi } from "vitest";

export function createTextInputMock() {
  const TextInput = React.forwardRef((props: any, ref: any) => {
    const instanceMethods = {
      focus: vi.fn(),
      blur: vi.fn(),
      clear: vi.fn(),
      isFocused: vi.fn(() => false),
      setNativeProps: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    // The ref is the handle above; the host takes none.
    return React.createElement("TextInput", props);
  });
  TextInput.displayName = "TextInput";
  return TextInput;
}
