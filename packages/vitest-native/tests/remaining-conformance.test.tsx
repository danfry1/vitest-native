/**
 * Remaining conformance tests — fills the last gaps in component and API coverage.
 *
 * Targets: FlatList (separators, empty, refresh, ref), Modal (visibility),
 *          TextInput (ref methods), Animated.createAnimatedComponent,
 *          AnimatedValue multi-listener ordering, modulo negative values.
 */

import { describe, it, expect, vi } from "vitest";
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react-native";
import {
  FlatList,
  Modal,
  TextInput,
  Text,
  View,
  Animated,
} from "react-native";

// ---------------------------------------------------------------------------
// FlatList
// ---------------------------------------------------------------------------

describe("FlatList (conformance)", () => {
  it("renders all items", () => {
    render(
      <FlatList
        data={["A", "B", "C"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
  });

  it("ItemSeparatorComponent appears between items only", () => {
    const Sep = () => <View testID="sep" />;
    render(
      <FlatList
        data={["A", "B", "C"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ItemSeparatorComponent={Sep}
      />,
    );
    // 3 items → 2 separators
    expect(screen.getAllByTestId("sep")).toHaveLength(2);
  });

  it("no separators for single item", () => {
    const Sep = () => <View testID="sep" />;
    render(
      <FlatList
        data={["Only"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ItemSeparatorComponent={Sep}
      />,
    );
    expect(screen.queryAllByTestId("sep")).toHaveLength(0);
  });

  it("ListEmptyComponent renders for empty data", () => {
    render(
      <FlatList
        data={[]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">No items</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("ListEmptyComponent does not render when data exists", () => {
    render(
      <FlatList
        data={["A"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">No items</Text>}
      />,
    );
    expect(screen.queryByTestId("empty")).toBeNull();
  });

  it("ListHeaderComponent and ListFooterComponent render", () => {
    render(
      <FlatList
        data={["A"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListHeaderComponent={() => <Text testID="header">Top</Text>}
        ListFooterComponent={() => <Text testID="footer">Bottom</Text>}
      />,
    );
    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("keyExtractor is called for each item", () => {
    const keyExtractor = vi.fn((item: string) => `k-${item}`);
    render(
      <FlatList
        data={["A", "B"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        keyExtractor={keyExtractor}
      />,
    );
    expect(keyExtractor).toHaveBeenCalledWith("A", 0);
    expect(keyExtractor).toHaveBeenCalledWith("B", 1);
  });

  it("renderItem receives item, index, and separators", () => {
    const renderItem = vi.fn(({ item }: any) => <Text>{item}</Text>);
    render(<FlatList data={["X"]} renderItem={renderItem} />);
    const call = renderItem.mock.calls[0][0];
    expect(call.item).toBe("X");
    expect(call.index).toBe(0);
    expect(call.separators).toBeDefined();
    expect(typeof call.separators.highlight).toBe("function");
    expect(typeof call.separators.unhighlight).toBe("function");
    expect(typeof call.separators.updateProps).toBe("function");
  });

  it("ref methods are available", () => {
    const ref = createRef<any>();
    render(
      <FlatList
        ref={ref}
        data={["A"]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(typeof ref.current.scrollToEnd).toBe("function");
    expect(typeof ref.current.scrollToIndex).toBe("function");
    expect(typeof ref.current.scrollToItem).toBe("function");
    expect(typeof ref.current.scrollToOffset).toBe("function");
    expect(typeof ref.current.flashScrollIndicators).toBe("function");
    expect(typeof ref.current.setNativeProps).toBe("function");
  });

  it("handles null data gracefully", () => {
    render(
      <FlatList
        data={null as any}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">Empty</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe("Modal (conformance)", () => {
  it("renders children when visible", () => {
    render(
      <Modal visible={true}>
        <Text testID="content">Hello</Text>
      </Modal>,
    );
    expect(screen.getByTestId("content")).toBeTruthy();
  });

  it("does not render children when visible=false", () => {
    render(
      <Modal visible={false}>
        <Text testID="content">Hello</Text>
      </Modal>,
    );
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("defaults to visible when prop omitted", () => {
    render(
      <Modal>
        <Text testID="content">Hello</Text>
      </Modal>,
    );
    expect(screen.getByTestId("content")).toBeTruthy();
  });

  it("passes additional props through", () => {
    render(
      <Modal visible={true} testID="modal" animationType="slide">
        <Text>Content</Text>
      </Modal>,
    );
    expect(screen.getByTestId("modal").props.animationType).toBe("slide");
  });
});

// ---------------------------------------------------------------------------
// TextInput ref methods
// ---------------------------------------------------------------------------

describe("TextInput ref methods (conformance)", () => {
  it("focus() is callable", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} testID="input" />);
    expect(() => ref.current.focus()).not.toThrow();
  });

  it("blur() is callable", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(() => ref.current.blur()).not.toThrow();
  });

  it("clear() is callable", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(() => ref.current.clear()).not.toThrow();
  });

  it("isFocused() returns false by default", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(ref.current.isFocused()).toBe(false);
  });

  it("setNativeProps() is callable", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(() => ref.current.setNativeProps({ text: "hello" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Animated.createAnimatedComponent
// ---------------------------------------------------------------------------

describe("Animated.createAnimatedComponent (conformance)", () => {
  it("wraps a component and renders it", () => {
    function MyComp(props: any) {
      return React.createElement("View", { testID: "inner", ...props });
    }
    MyComp.displayName = "MyComp";
    const AnimatedMyComp = Animated.createAnimatedComponent(MyComp);
    render(React.createElement(AnimatedMyComp, { style: { opacity: 1 } }));
    expect(screen.getByTestId("inner")).toBeTruthy();
  });

  it("sets displayName with Animated() prefix", () => {
    function Foo() {
      return null;
    }
    Foo.displayName = "Foo";
    const AnimatedFoo = Animated.createAnimatedComponent(Foo);
    expect(AnimatedFoo.displayName).toBe("Animated(Foo)");
  });

  it("falls back to function name for displayName", () => {
    function BarComponent() {
      return null;
    }
    const AnimatedBar = Animated.createAnimatedComponent(BarComponent);
    expect(AnimatedBar.displayName).toBe("Animated(BarComponent)");
  });

  it("falls back to 'Component' when no name", () => {
    const Anon = () => null;
    // Remove name by wrapping
    const NoName = Object.defineProperty(Anon, "name", { value: "" });
    const AnimatedAnon = Animated.createAnimatedComponent(NoName);
    expect(AnimatedAnon.displayName).toBe("Animated(Component)");
  });
});

// ---------------------------------------------------------------------------
// Animated.Value — multiple listeners fire in order
// ---------------------------------------------------------------------------

describe("Animated.Value multiple listeners (conformance)", () => {
  it("fires all listeners on setValue", () => {
    const val = new Animated.Value(0);
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    val.addListener(a);
    val.addListener(b);
    val.addListener(c);
    val.setValue(42);
    expect(a).toHaveBeenCalledWith({ value: 42 });
    expect(b).toHaveBeenCalledWith({ value: 42 });
    expect(c).toHaveBeenCalledWith({ value: 42 });
  });

  it("removing one listener keeps others active", () => {
    const val = new Animated.Value(0);
    const a = vi.fn();
    const b = vi.fn();
    val.addListener(a);
    const idB = val.addListener(b);
    val.removeListener(idB);
    val.setValue(10);
    expect(a).toHaveBeenCalledWith({ value: 10 });
    expect(b).not.toHaveBeenCalled();
  });

  it("listener IDs are unique strings", () => {
    const val = new Animated.Value(0);
    const id1 = val.addListener(vi.fn());
    const id2 = val.addListener(vi.fn());
    const id3 = val.addListener(vi.fn());
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(typeof id1).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Animated modulo with negative values
// ---------------------------------------------------------------------------

describe("Animated.modulo edge cases (conformance)", () => {
  it("positive modulo", () => {
    const val = new Animated.Value(7);
    expect(Animated.modulo(val, 3).getValue()).toBe(1);
  });

  it("negative value returns positive remainder (euclidean)", () => {
    const val = new Animated.Value(-1);
    // (((-1 % 3) + 3) % 3) = (((-1) + 3) % 3) = (2 % 3) = 2
    expect(Animated.modulo(val, 3).getValue()).toBe(2);
  });

  it("zero modulo", () => {
    const val = new Animated.Value(0);
    expect(Animated.modulo(val, 5).getValue()).toBe(0);
  });

  it("exact multiple returns 0", () => {
    const val = new Animated.Value(9);
    expect(Animated.modulo(val, 3).getValue()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Animated.loop / delay / stagger
// ---------------------------------------------------------------------------

describe("Animated composition functions (conformance)", () => {
  it("loop returns animation with start/stop/reset", () => {
    const val = new Animated.Value(0);
    const anim = Animated.loop(
      Animated.timing(val, { toValue: 1, useNativeDriver: false }),
    );
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("delay returns animation with start/stop/reset", () => {
    const anim = Animated.delay(1000);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("stagger returns animation with start/stop/reset", () => {
    const val = new Animated.Value(0);
    const anim = Animated.stagger(100, [
      Animated.timing(val, { toValue: 1, useNativeDriver: false }),
    ]);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("loop start calls callback with finished:true", () => {
    const cb = vi.fn();
    Animated.loop(Animated.timing(new Animated.Value(0), { toValue: 1 })).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("delay start calls callback with finished:true", () => {
    const cb = vi.fn();
    Animated.delay(0).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });
});
