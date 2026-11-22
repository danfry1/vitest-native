/**
 * The corrections the keyboard-controller preset adds to the library's own Jest mock
 * (presets/keyboard-controller.ts, #708) replace only what that mock lacks, and read the
 * mock's hooks without calling them. tests-native/keyboard-controller-mock.test.tsx checks
 * the corrected module the native engine serves.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { mockCorrections } from "../src/presets/keyboard-controller.js";

const fullShared = (value: unknown) => ({
  value,
  get: () => value,
  set: () => {},
  addListener: () => {},
  removeListener: () => {},
  modify: () => {},
});

/** The shape of keyboard-controller 1.22.9's jest/index.js, with `values` as its hooks give. */
function libraryMock(values: { shared: (value: unknown) => unknown; update?: boolean }) {
  const reanimated = { progress: values.shared(0), height: values.shared(0) };
  const focused = {
    input: values.shared({ layout: { width: 200 } }),
    ...(values.update ? { update: () => Promise.resolve() } : {}),
  };
  return {
    useKeyboardAnimation: vi.fn().mockReturnValue({ progress: {}, height: {} }),
    useReanimatedKeyboardAnimation: vi.fn().mockReturnValue(reanimated),
    useReanimatedFocusedInput: vi.fn().mockReturnValue(focused),
    useKeyboardContext: vi.fn().mockReturnValue({ animated: {}, reanimated }),
    KeyboardController: { dismiss: vi.fn() },
  };
}

describe("keyboard-controller mock corrections", () => {
  it("reads the mock's hooks without calling them", () => {
    const mock = libraryMock({ shared: (value) => ({ value, get: () => value, set: () => {} }) });
    mockCorrections(React, mock);
    expect(mock.useKeyboardAnimation).not.toHaveBeenCalled();
    expect(mock.useReanimatedKeyboardAnimation).not.toHaveBeenCalled();
    expect(mock.useReanimatedFocusedInput).not.toHaveBeenCalled();
    expect(mock.useKeyboardContext).not.toHaveBeenCalled();
  });

  it("replaces a shared value that lacks modify(), even with listeners", () => {
    const { modify: _modify, ...withoutModify } = fullShared(0);
    const mock = libraryMock({ shared: () => withoutModify, update: true });
    const out = mockCorrections(React, mock);
    expect(out.useReanimatedKeyboardAnimation).not.toBe(mock.useReanimatedKeyboardAnimation);
    expect(typeof out.useReanimatedKeyboardAnimation().height.modify).toBe("function");
  });

  it("keeps the hooks of a mock whose shared values and focused input are complete", () => {
    const mock = libraryMock({ shared: fullShared, update: true });
    const out = mockCorrections(React, mock);
    expect(out.useReanimatedKeyboardAnimation).toBe(mock.useReanimatedKeyboardAnimation);
    expect(out.useReanimatedFocusedInput).toBe(mock.useReanimatedFocusedInput);
  });

  it("keeps a name the mock has, and leaves the mock itself as it was", () => {
    const mock = {
      ...libraryMock({ shared: fullShared, update: true }),
      KeyboardState: { OWN: 1 },
      KEYBOARD_BORDER_RADIUS: 12,
    };
    const before = { ...mock };
    const out = mockCorrections(React, mock);
    expect(out.KeyboardState).toBe(mock.KeyboardState);
    expect(out.KEYBOARD_HAS_ROUNDED_CORNERS).toBe(true);
    expect(mock).toEqual(before);
    expect(mock.KeyboardController).not.toHaveProperty("setTranslucent");
  });
});
