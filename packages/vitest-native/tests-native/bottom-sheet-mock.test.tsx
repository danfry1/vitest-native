/**
 * Under the native engine @gorhom/bottom-sheet is its own Jest mock
 * (`@gorhom/bottom-sheet/mock`), with what that mock lacks of the package's public API
 * added and its shapes corrected (presets/bottom-sheet.ts, mockCorrections; #714).
 * tests/bottom-sheet-corrections.test.ts checks the corrections on their own.
 */
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import {
  ANIMATION_CONFIGS,
  ANIMATION_EASING,
  BottomSheetScrollView,
  INITIAL_LAYOUT_VALUE,
  KEYBOARD_BEHAVIOR,
  SCROLLABLE_DECELERATION_RATE_MAPPER,
  SCROLLABLE_STATUS,
  createBottomSheetScrollableComponent,
  useBottomSheet,
  useBottomSheetInternal,
  useBottomSheetModalInternal,
  useBottomSheetScrollableCreator,
  useGestureEventsHandlersDefault,
  useScrollHandler,
} from "@gorhom/bottom-sheet";
import { expect, it, vi } from "vitest";

/** Renders `hook` in a component and returns what it gave on each render. */
async function renderHook<T>(hook: () => T) {
  const seen: T[] = [];
  function Probe({ tick }: { tick: number }) {
    void tick;
    seen.push(hook());
    return null;
  }
  const { rerender } = await render(<Probe tick={0} />);
  return { seen, rerender: () => rerender(<Probe tick={1} />) };
}

it("useBottomSheet's animated values are shared values with listeners, shared with the internal context", async () => {
  const { seen } = await renderHook(() => ({
    sheet: useBottomSheet(),
    internal: useBottomSheetInternal(),
  }));
  const { animatedIndex } = seen[0].sheet;
  const heard: number[] = [];
  animatedIndex.addListener(1, (value: number) => heard.push(value));
  animatedIndex.set(1);
  animatedIndex.modify((value: number) => value + 1);
  animatedIndex.removeListener(1);
  expect(heard).toEqual([1, 2]);
  expect(seen[0].internal.animatedIndex).toBe(animatedIndex);
});

it("useBottomSheetInternal gives a closed sheet's context, with its default props", async () => {
  const { seen } = await renderHook(() => useBottomSheetInternal());
  const internal = seen[0];
  expect(internal).toMatchObject({
    enableContentPanningGesture: true,
    enableOverDrag: true,
    enablePanDownToClose: false,
    enableDynamicSizing: true,
    enableBlurKeyboardOnGesture: false,
    overDragResistanceFactor: 2.5,
  });
  expect(internal.textInputNodesRef.current).toBeInstanceOf(Set);
  expect(internal.animatedLayoutState.get().containerHeight).toBe(INITIAL_LAYOUT_VALUE);
  expect(internal.animatedKeyboardState.get()).toMatchObject({ status: 0, height: 0 });
  expect(internal.animatedDetentsState.get()).toEqual({});
  expect(typeof internal.isInTemporaryPosition.modify).toBe("function");
  expect(typeof internal.stopAnimation).toBe("function");
});

it("useBottomSheetModalInternal gives a host name and the container's layout", async () => {
  const { seen } = await renderHook(() => useBottomSheetModalInternal());
  expect(typeof seen[0].hostName).toBe("string");
  expect(seen[0].containerLayoutState.get().height).toBe(INITIAL_LAYOUT_VALUE);
  expect(typeof seen[0].mountSheet).toBe("function");
});

it("serves the constants with the platform's values", () => {
  expect(ANIMATION_CONFIGS).toMatchObject({ damping: 500, stiffness: 1000, mass: 3 });
  expect(SCROLLABLE_DECELERATION_RATE_MAPPER[SCROLLABLE_STATUS.UNLOCKED]).toBe(0.998);
  expect(SCROLLABLE_DECELERATION_RATE_MAPPER[SCROLLABLE_STATUS.LOCKED]).toBe(0);
  expect(ANIMATION_EASING(0)).toBe(0);
  expect(ANIMATION_EASING(1)).toBeCloseTo(0.999, 3);
  expect(KEYBOARD_BEHAVIOR.fillParent).toBe("fillParent");
});

it("useScrollHandler keeps its ref and handler, and the handler calls the latest onScroll", async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const handlers = [first, latest];
  let renders = 0;
  const { seen, rerender } = await renderHook(() =>
    useScrollHandler(undefined, handlers[Math.min(renders++, 1)]),
  );
  await rerender();
  expect(seen[1].scrollableRef).toBe(seen[0].scrollableRef);
  expect(typeof seen[0].scrollableRef.observe).toBe("function");
  (seen[1].scrollHandler as unknown as (e: unknown) => void)({ contentOffset: { y: 4 } });
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({ nativeEvent: { contentOffset: { y: 4 } } });
  expect(seen[0].scrollableContentOffsetY.get()).toBe(0);
});

it("useGestureEventsHandlersDefault gives the four gesture callbacks", async () => {
  const { seen } = await renderHook(() => useGestureEventsHandlersDefault());
  expect(Object.keys(seen[0]).sort()).toEqual([
    "handleOnChange",
    "handleOnEnd",
    "handleOnFinalize",
    "handleOnStart",
  ]);
});

it("a scrollable from useBottomSheetScrollableCreator renders its content", async () => {
  function List() {
    const renderScroll = useBottomSheetScrollableCreator();
    return renderScroll({ testID: "list", children: <Text>row</Text> });
  }
  await render(<List />);
  expect(screen.getByTestId("list")).toBeTruthy();
  expect(screen.getByText("row")).toBeTruthy();
});

it("createBottomSheetScrollableComponent returns a memoised component that renders and takes a ref", async () => {
  const Scrollable = createBottomSheetScrollableComponent(
    SCROLLABLE_STATUS.LOCKED as never,
    BottomSheetScrollView,
  );
  expect((Scrollable as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  const ref = React.createRef<unknown>();
  await render(
    <Scrollable ref={ref} testID="scrollable">
      <Text>inside</Text>
    </Scrollable>,
  );
  expect(screen.getByText("inside")).toBeTruthy();
  expect(ref.current).not.toBeNull();
});
