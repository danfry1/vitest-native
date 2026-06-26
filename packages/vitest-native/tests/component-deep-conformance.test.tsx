/**
 * Deep component conformance tests — covers component mocks with
 * complex behavioral logic that wasn't previously tested.
 *
 * Targets: Button (disabled guard, color), SectionList (separators, footers,
 *          empty state), VirtualizedList (getItemCount/getItem, empty state).
 */

import { describe, it, expect, vi } from "vitest";
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react-native";
import { Button, SectionList, VirtualizedList, Text, View } from "react-native";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe("Button (conformance)", () => {
  it("renders title text", async () => {
    await render(<Button title="Press me" onPress={() => {}} />);
    expect(screen.getByText("Press me")).toBeTruthy();
  });

  it("has accessibilityRole button", async () => {
    await render(<Button title="OK" onPress={() => {}} testID="btn" />);
    expect(screen.getByTestId("btn").props.accessibilityRole).toBe("button");
  });

  it("uses title as accessibilityLabel by default", async () => {
    await render(<Button title="Submit" onPress={() => {}} testID="btn" />);
    expect(screen.getByTestId("btn").props.accessibilityLabel).toBe("Submit");
  });

  it("custom accessibilityLabel overrides title", async () => {
    await render(
      <Button title="Submit" accessibilityLabel="Submit form" onPress={() => {}} testID="btn" />,
    );
    expect(screen.getByTestId("btn").props.accessibilityLabel).toBe("Submit form");
  });

  it("disabled button does not have onPress handler", async () => {
    await render(<Button title="Disabled" onPress={() => {}} disabled testID="btn" />);
    // When disabled, onPress is set to undefined
    expect(screen.getByTestId("btn").props.onPress).toBeUndefined();
  });

  it("disabled button sets accessibilityState.disabled", async () => {
    await render(<Button title="Disabled" onPress={() => {}} disabled testID="btn" />);
    expect(screen.getByTestId("btn").props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it("enabled button has onPress handler", async () => {
    const handler = vi.fn();
    await render(<Button title="OK" onPress={handler} testID="btn" />);
    expect(screen.getByTestId("btn").props.onPress).toBe(handler);
  });

  it("enabled button has no accessibilityState", async () => {
    await render(<Button title="OK" onPress={() => {}} testID="btn" />);
    expect(screen.getByTestId("btn").props.accessibilityState).toBeUndefined();
  });

  it("color prop is applied to child Text style", async () => {
    await render(<Button title="Colored" onPress={() => {}} color="red" />);
    const text = screen.getByText("Colored");
    expect(text.props.style).toEqual({ color: "red" });
  });

  it("no color prop means no style on Text", async () => {
    await render(<Button title="Plain" onPress={() => {}} />);
    const text = screen.getByText("Plain");
    expect(text.props.style).toBeUndefined();
  });

  it("is accessible", async () => {
    await render(<Button title="OK" onPress={() => {}} testID="btn" />);
    expect(screen.getByTestId("btn").props.accessible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SectionList
// ---------------------------------------------------------------------------

describe("SectionList (conformance)", () => {
  const sections = [
    { title: "Fruits", data: ["Apple", "Banana"] },
    { title: "Veggies", data: ["Carrot", "Pea"] },
  ];

  it("renders section headers", async () => {
    await render(
      <SectionList
        sections={sections}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        renderSectionHeader={({ section }: any) => (
          <Text testID={`header-${section.title}`}>{section.title}</Text>
        )}
      />,
    );
    expect(screen.getByTestId("header-Fruits")).toBeTruthy();
    expect(screen.getByTestId("header-Veggies")).toBeTruthy();
  });

  it("renders all items from all sections", async () => {
    await render(
      <SectionList sections={sections} renderItem={({ item }: any) => <Text>{item}</Text>} />,
    );
    expect(screen.getByText("Apple")).toBeTruthy();
    expect(screen.getByText("Banana")).toBeTruthy();
    expect(screen.getByText("Carrot")).toBeTruthy();
    expect(screen.getByText("Pea")).toBeTruthy();
  });

  it("renders section footers", async () => {
    await render(
      <SectionList
        sections={sections}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        renderSectionFooter={({ section }: any) => (
          <Text testID={`footer-${section.title}`}>{section.data.length} items</Text>
        )}
      />,
    );
    expect(screen.getByTestId("footer-Fruits")).toBeTruthy();
    expect(screen.getByTestId("footer-Veggies")).toBeTruthy();
  });

  it("SectionSeparatorComponent appears between sections, not before first", async () => {
    const SepComponent = () => <View testID="section-sep" />;
    await render(
      <SectionList
        sections={sections}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        SectionSeparatorComponent={SepComponent}
      />,
    );
    // With 2 sections, there should be exactly 1 separator (between them)
    const seps = screen.getAllByTestId("section-sep");
    expect(seps).toHaveLength(1);
  });

  it("ItemSeparatorComponent appears between items within a section", async () => {
    const Sep = () => <View testID="item-sep" />;
    await render(
      <SectionList
        sections={[{ title: "A", data: ["1", "2", "3"] }]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ItemSeparatorComponent={Sep}
      />,
    );
    // 3 items → 2 separators
    const seps = screen.getAllByTestId("item-sep");
    expect(seps).toHaveLength(2);
  });

  it("renderItem receives section and separators", async () => {
    const renderItem = vi.fn(({ item }: any) => <Text>{item}</Text>);
    await render(<SectionList sections={[{ title: "A", data: ["x"] }]} renderItem={renderItem} />);
    const call = renderItem.mock.calls[0][0];
    expect(call.item).toBe("x");
    expect(call.index).toBe(0);
    expect(call.section).toEqual({ title: "A", data: ["x"] });
    expect(call.separators).toBeDefined();
    expect(typeof call.separators.highlight).toBe("function");
    expect(typeof call.separators.unhighlight).toBe("function");
  });

  it("ListEmptyComponent renders when sections is empty", async () => {
    await render(
      <SectionList
        sections={[]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">No data</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("ListEmptyComponent renders when sections is undefined", async () => {
    await render(
      <SectionList
        sections={undefined as any}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">No data</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("ListHeaderComponent and ListFooterComponent render", async () => {
    await render(
      <SectionList
        sections={sections}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListHeaderComponent={() => <Text testID="list-header">Top</Text>}
        ListFooterComponent={() => <Text testID="list-footer">Bottom</Text>}
      />,
    );
    expect(screen.getByTestId("list-header")).toBeTruthy();
    expect(screen.getByTestId("list-footer")).toBeTruthy();
  });

  it("keyExtractor is called for each item", async () => {
    const keyExtractor = vi.fn((item: string) => `key-${item}`);
    await render(
      <SectionList
        sections={[{ title: "A", data: ["x", "y"] }]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        keyExtractor={keyExtractor}
      />,
    );
    expect(keyExtractor).toHaveBeenCalledWith("x", 0);
    expect(keyExtractor).toHaveBeenCalledWith("y", 1);
  });

  it("ref methods are available", async () => {
    const ref = createRef<any>();
    await render(
      <SectionList
        ref={ref}
        sections={sections}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(typeof ref.current.scrollToEnd).toBe("function");
    expect(typeof ref.current.scrollToLocation).toBe("function");
    expect(typeof ref.current.flashScrollIndicators).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// VirtualizedList
// ---------------------------------------------------------------------------

describe("VirtualizedList (conformance)", () => {
  it("renders items using data array", async () => {
    await render(
      <VirtualizedList
        data={["A", "B", "C"]}
        getItemCount={(data: any) => data.length}
        getItem={(data: any, i: number) => data[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
  });

  it("uses getItemCount/getItem for custom data structures", async () => {
    const data = { items: ["X", "Y"], total: 2 };
    await render(
      <VirtualizedList
        data={data}
        getItemCount={(d: any) => d.total}
        getItem={(d: any, i: number) => d.items[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(screen.getByText("X")).toBeTruthy();
    expect(screen.getByText("Y")).toBeTruthy();
  });

  it("falls back to data.length when getItemCount not provided", async () => {
    await render(
      <VirtualizedList data={["A", "B"]} renderItem={({ item }: any) => <Text>{item}</Text>} />,
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("renders ListEmptyComponent for empty data", async () => {
    await render(
      <VirtualizedList
        data={[]}
        getItemCount={(d: any) => d.length}
        getItem={(d: any, i: number) => d[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListEmptyComponent={() => <Text testID="empty">Empty</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("renders ListEmptyComponent for null data", async () => {
    await render(
      <VirtualizedList
        data={null}
        getItemCount={() => 0}
        getItem={() => null}
        renderItem={({ item }: any) => <Text>{String(item)}</Text>}
        ListEmptyComponent={() => <Text testID="empty">Empty</Text>}
      />,
    );
    expect(screen.getByTestId("empty")).toBeTruthy();
  });

  it("renders ListHeaderComponent and ListFooterComponent", async () => {
    await render(
      <VirtualizedList
        data={["item"]}
        getItemCount={(d: any) => d.length}
        getItem={(d: any, i: number) => d[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        ListHeaderComponent={() => <Text testID="header">Header</Text>}
        ListFooterComponent={() => <Text testID="footer">Footer</Text>}
      />,
    );
    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("keyExtractor is used for each item", async () => {
    const keyExtractor = vi.fn((item: string) => `k-${item}`);
    await render(
      <VirtualizedList
        data={["A", "B"]}
        getItemCount={(d: any) => d.length}
        getItem={(d: any, i: number) => d[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
        keyExtractor={keyExtractor}
      />,
    );
    expect(keyExtractor).toHaveBeenCalledWith("A", 0);
    expect(keyExtractor).toHaveBeenCalledWith("B", 1);
  });

  it("renderItem receives item, index, and separators", async () => {
    const renderItem = vi.fn(({ item }: any) => <Text>{item}</Text>);
    await render(
      <VirtualizedList
        data={["Z"]}
        getItemCount={(d: any) => d.length}
        getItem={(d: any, i: number) => d[i]}
        renderItem={renderItem}
      />,
    );
    const call = renderItem.mock.calls[0][0];
    expect(call.item).toBe("Z");
    expect(call.index).toBe(0);
    expect(call.separators).toBeDefined();
  });

  it("ref methods are available", async () => {
    const ref = createRef<any>();
    await render(
      <VirtualizedList
        ref={ref}
        data={["A"]}
        getItemCount={(d: any) => d.length}
        getItem={(d: any, i: number) => d[i]}
        renderItem={({ item }: any) => <Text>{item}</Text>}
      />,
    );
    expect(typeof ref.current.scrollToEnd).toBe("function");
    expect(typeof ref.current.scrollToIndex).toBe("function");
    expect(typeof ref.current.scrollToItem).toBe("function");
    expect(typeof ref.current.scrollToOffset).toBe("function");
    expect(typeof ref.current.flashScrollIndicators).toBe("function");
  });
});
