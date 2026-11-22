import { vi } from "vitest";

export function createTextInputMock(React: typeof import("react")) {
  const TextInput = React.forwardRef((props: any, ref: any) => {
    // A host ref's native methods as well as TextInput's own, as real React Native's
    // TextInput ref has them (crosscheck: host-refs-and-props).
    const instanceMethods = {
      focus: vi.fn(),
      blur: vi.fn(),
      clear: vi.fn(),
      isFocused: vi.fn(() => false),
      setNativeProps: vi.fn(),
      measure: vi.fn(),
      measureInWindow: vi.fn(),
      measureLayout: vi.fn(),
    };

    React.useImperativeHandle(ref, () => instanceMethods);

    // The ref is the handle above; the host takes none.
    return React.createElement("TextInput", props);
  });
  TextInput.displayName = "TextInput";
  return TextInput;
}
