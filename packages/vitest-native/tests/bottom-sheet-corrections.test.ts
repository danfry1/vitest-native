/**
 * The corrections the bottom-sheet preset adds to the library's own Jest mock
 * (presets/bottom-sheet.ts, #714) replace only what that mock gets wrong, add only the
 * names it lacks, and leave the mock itself as it was. tests-native/bottom-sheet-mock.test.tsx
 * checks the corrected module the native engine serves.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { mockCorrections } from "../src/presets/bottom-sheet.js";

const full = (value: unknown) => ({
  value,
  get: () => value,
  set: () => {},
  addListener: () => {},
  removeListener: () => {},
  modify: () => {},
});
const NOOP_VALUE = { value: 0, get: () => 0, set: () => {} };

/** @gorhom/bottom-sheet 5.2.14's mock.js, in the parts the corrections read. */
function libraryMock() {
  const internalMethods = {
    stopAnimation: () => {},
    animateToPosition: () => {},
    setScrollableRef: () => {},
    removeScrollableRef: () => {},
  };
  const proxy = (target: object) =>
    new Proxy(target, {
      get: (t, prop) => (prop in t ? (t as Record<PropertyKey, unknown>)[prop] : NOOP_VALUE),
    });
  return {
    BottomSheetScrollView: () => null,
    useBottomSheet: () => ({ animatedIndex: NOOP_VALUE, animatedPosition: NOOP_VALUE }),
    useBottomSheetInternal: () => proxy(internalMethods),
    useBottomSheetModalInternal: () =>
      proxy({ mountSheet: () => {}, unmountSheet: () => {}, willUnmountSheet: () => {} }),
    createBottomSheetScrollableComponent: (_type: unknown, Component: unknown) => Component,
  };
}

describe("bottom-sheet mock corrections", () => {
  it("corrects the 5.2.14 mock's shapes and adds the names it lacks", () => {
    const mock = libraryMock();
    const out = mockCorrections(React, mock);
    expect(typeof out.useBottomSheet().animatedIndex.modify).toBe("function");
    expect(out.useBottomSheetInternal().enableOverDrag).toBe(true);
    expect(typeof out.useBottomSheetModalInternal().hostName).toBe("string");
    expect(out.KEYBOARD_DISMISS_THRESHOLD).toBe(12.5);
    expect(typeof out.useScrollHandler).toBe("function");
  });

  it("corrects animated values that have listeners but lack modify()", () => {
    const { modify: _modify, ...withoutModify } = full(0);
    const mock = {
      ...libraryMock(),
      useBottomSheet: () => ({ animatedIndex: withoutModify, animatedPosition: withoutModify }),
    };
    const out = mockCorrections(React, mock);
    expect(out.useBottomSheet).not.toBe(mock.useBottomSheet);
    expect(typeof out.useBottomSheet().animatedPosition.modify).toBe("function");
  });

  it("keeps a mock's own hooks when their shapes are already right, and its own names", () => {
    const mock = {
      ...libraryMock(),
      useBottomSheet: () => ({ animatedIndex: full(0), animatedPosition: full(0) }),
      useBottomSheetInternal: () => ({ enableOverDrag: false }),
      useBottomSheetModalInternal: () => ({ hostName: "own" }),
      createBottomSheetScrollableComponent: () => React.memo(() => null),
      KEYBOARD_DISMISS_THRESHOLD: 99,
    };
    const out = mockCorrections(React, mock);
    expect(out.useBottomSheet).toBe(mock.useBottomSheet);
    expect(out.useBottomSheetInternal).toBe(mock.useBottomSheetInternal);
    expect(out.useBottomSheetModalInternal).toBe(mock.useBottomSheetModalInternal);
    expect(out.createBottomSheetScrollableComponent).toBe(
      mock.createBottomSheetScrollableComponent,
    );
    expect(out.KEYBOARD_DISMISS_THRESHOLD).toBe(99);
  });

  it("leaves the mock itself as it was", () => {
    const mock = libraryMock();
    const before = { ...mock };
    mockCorrections(React, mock);
    expect(mock).toEqual(before);
    expect(mock).not.toHaveProperty("useScrollHandler");
  });
});
