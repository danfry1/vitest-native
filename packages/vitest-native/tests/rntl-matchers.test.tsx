/**
 * RNTL matcher conformance tests.
 *
 * Exercises @testing-library/react-native matchers against our mocks to
 * verify the full query→matcher pipeline works correctly. These are the
 * patterns real users write in their tests.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  Switch,
  Modal,
  ActivityIndicator,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

// ---------------------------------------------------------------------------
// Visibility matchers
// ---------------------------------------------------------------------------

describe("toBeVisible", () => {
  it("visible by default", () => {
    render(<View testID="v"><Text>Hi</Text></View>);
    expect(screen.getByTestId("v")).toBeVisible();
  });

  it("hidden via display: none is excluded from default queries", () => {
    render(<View testID="v" style={{ display: "none" }}><Text>Hi</Text></View>);
    // RNTL v12+ excludes hidden elements from queries by default
    expect(screen.queryByTestId("v")).toBeNull();
  });

  it("hidden via opacity: 0 is not visible", () => {
    render(<View testID="v" style={{ opacity: 0 }}><Text>Hi</Text></View>);
    expect(screen.getByTestId("v")).not.toBeVisible();
  });

  it("child inherits parent display: none", () => {
    render(
      <View style={{ display: "none" }}>
        <Text testID="t">Hidden child</Text>
      </View>,
    );
    // Child is also excluded from queries when parent has display: none
    expect(screen.queryByTestId("t")).toBeNull();
  });

  it("Modal visible=false hides children", () => {
    render(
      <Modal visible={false}>
        <Text testID="t">Inside modal</Text>
      </Modal>,
    );
    expect(screen.queryByTestId("t")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toBeOnTheScreen
// ---------------------------------------------------------------------------

describe("toBeOnTheScreen", () => {
  it("rendered element is on screen", () => {
    render(<Text testID="t">Hello</Text>);
    expect(screen.getByTestId("t")).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// toHaveTextContent
// ---------------------------------------------------------------------------

describe("toHaveTextContent", () => {
  it("matches exact text", () => {
    render(<Text testID="t">Hello World</Text>);
    expect(screen.getByTestId("t")).toHaveTextContent("Hello World");
  });

  it("matches partial text with regex", () => {
    render(<Text testID="t">Hello World</Text>);
    expect(screen.getByTestId("t")).toHaveTextContent(/Hello/);
  });

  it("matches nested text", () => {
    render(
      <Text testID="t">
        Hello <Text>World</Text>
      </Text>,
    );
    expect(screen.getByTestId("t")).toHaveTextContent("Hello World");
  });
});

// ---------------------------------------------------------------------------
// toHaveProp
// ---------------------------------------------------------------------------

describe("toHaveProp", () => {
  it("checks prop existence", () => {
    render(<View testID="v" accessible />);
    expect(screen.getByTestId("v")).toHaveProp("accessible", true);
  });

  it("checks prop value", () => {
    render(<Image testID="img" source={{ uri: "test.png" }} />);
    expect(screen.getByTestId("img")).toHaveProp("source", { uri: "test.png" });
  });
});

// ---------------------------------------------------------------------------
// toHaveStyle
// ---------------------------------------------------------------------------

describe("toHaveStyle", () => {
  it("matches inline styles", () => {
    render(<View testID="v" style={{ backgroundColor: "red", flex: 1 }} />);
    expect(screen.getByTestId("v")).toHaveStyle({ backgroundColor: "red" });
    expect(screen.getByTestId("v")).toHaveStyle({ flex: 1 });
  });

  it("matches StyleSheet styles", () => {
    const styles = StyleSheet.create({ box: { padding: 10, margin: 5 } });
    render(<View testID="v" style={styles.box} />);
    expect(screen.getByTestId("v")).toHaveStyle({ padding: 10 });
  });

  it("matches array styles", () => {
    render(<View testID="v" style={[{ flex: 1 }, { backgroundColor: "blue" }]} />);
    expect(screen.getByTestId("v")).toHaveStyle({ backgroundColor: "blue" });
  });
});

// ---------------------------------------------------------------------------
// toBeEnabled / toBeDisabled
// ---------------------------------------------------------------------------

describe("toBeEnabled / toBeDisabled", () => {
  it("Pressable enabled by default", () => {
    render(<Pressable testID="p"><Text>Press</Text></Pressable>);
    expect(screen.getByTestId("p")).toBeEnabled();
  });

  it("Pressable disabled", () => {
    render(<Pressable testID="p" disabled><Text>Press</Text></Pressable>);
    expect(screen.getByTestId("p")).toBeDisabled();
  });

  it("TextInput editable by default (enabled)", () => {
    render(<TextInput testID="ti" />);
    expect(screen.getByTestId("ti")).toBeEnabled();
  });

  it("TextInput editable=false (disabled)", () => {
    render(<TextInput testID="ti" editable={false} />);
    expect(screen.getByTestId("ti")).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// toBeEmptyElement
// ---------------------------------------------------------------------------

describe("toBeEmptyElement", () => {
  it("empty View", () => {
    render(<View testID="v" />);
    expect(screen.getByTestId("v")).toBeEmptyElement();
  });

  it("View with children is not empty", () => {
    render(<View testID="v"><Text>Hi</Text></View>);
    expect(screen.getByTestId("v")).not.toBeEmptyElement();
  });
});

// ---------------------------------------------------------------------------
// toContainElement
// ---------------------------------------------------------------------------

describe("toContainElement", () => {
  it("parent contains child", () => {
    render(
      <View testID="parent">
        <Text testID="child">Hello</Text>
      </View>,
    );
    const parent = screen.getByTestId("parent");
    const child = screen.getByTestId("child");
    expect(parent).toContainElement(child);
  });
});

// ---------------------------------------------------------------------------
// Switch / toBeChecked
// ---------------------------------------------------------------------------

describe("Switch matchers", () => {
  it("Switch with value=true is checked", () => {
    render(<Switch testID="sw" value={true} />);
    expect(screen.getByTestId("sw")).toBeChecked();
  });

  it("Switch with value=false is not checked", () => {
    render(<Switch testID="sw" value={false} />);
    expect(screen.getByTestId("sw")).not.toBeChecked();
  });

  it("Switch onValueChange fires", () => {
    const onChange = vi.fn();
    render(<Switch testID="sw" value={false} onValueChange={onChange} />);
    fireEvent(screen.getByTestId("sw"), "valueChange", true);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// Accessibility matchers
// ---------------------------------------------------------------------------

describe("accessibility matchers", () => {
  it("toHaveAccessibilityValue with numeric value", () => {
    render(
      <View
        testID="slider"
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: 50 }}
      />,
    );
    expect(screen.getByTestId("slider")).toHaveAccessibilityValue({ now: 50 });
  });

  it("toHaveAccessibilityValue with text value", () => {
    render(
      <View testID="v" accessibilityValue={{ text: "high" }} />,
    );
    expect(screen.getByTestId("v")).toHaveAccessibilityValue({ text: "high" });
  });
});

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

describe("RNTL query types", () => {
  it("getByText", () => {
    render(<Text>Unique text here</Text>);
    expect(screen.getByText("Unique text here")).toBeTruthy();
  });

  it("getByTestId", () => {
    render(<View testID="my-view" />);
    expect(screen.getByTestId("my-view")).toBeTruthy();
  });

  it("getByPlaceholderText", () => {
    render(<TextInput placeholder="Type here..." />);
    expect(screen.getByPlaceholderText("Type here...")).toBeTruthy();
  });

  it("getByDisplayValue", () => {
    render(<TextInput value="current value" />);
    expect(screen.getByDisplayValue("current value")).toBeTruthy();
  });

  it("getByRole", () => {
    render(<Pressable accessibilityRole="button"><Text>Click</Text></Pressable>);
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("getByLabelText", () => {
    render(<Pressable accessibilityLabel="Submit form"><Text>Submit</Text></Pressable>);
    expect(screen.getByLabelText("Submit form")).toBeTruthy();
  });

  it("getByHintText", () => {
    render(<View accessibilityHint="Double tap to activate" testID="v" />);
    expect(screen.getByHintText("Double tap to activate")).toBeTruthy();
  });

  it("queryByText returns null for missing text", () => {
    render(<Text>Hello</Text>);
    expect(screen.queryByText("Does not exist")).toBeNull();
  });

  it("getAllByText returns multiple matches", () => {
    render(
      <View>
        <Text>Repeated</Text>
        <Text>Repeated</Text>
      </View>,
    );
    expect(screen.getAllByText("Repeated")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// List components
// ---------------------------------------------------------------------------

describe("FlatList rendering", () => {
  it("renders items", () => {
    const data = [{ key: "1", title: "Item 1" }, { key: "2", title: "Item 2" }];
    render(
      <FlatList
        testID="list"
        data={data}
        renderItem={({ item }) => <Text>{item.title}</Text>}
      />,
    );
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Item 2")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(
      <FlatList
        testID="list"
        data={[]}
        renderItem={({ item }) => <Text>{(item as any).title}</Text>}
        ListEmptyComponent={<Text>No items</Text>}
      />,
    );
    expect(screen.getByText("No items")).toBeTruthy();
  });
});

describe("SectionList rendering", () => {
  it("renders sections with headers", () => {
    const sections = [
      { title: "Section A", data: [{ key: "1", text: "A1" }] },
      { title: "Section B", data: [{ key: "2", text: "B1" }] },
    ];
    render(
      <SectionList
        sections={sections}
        renderItem={({ item }) => <Text>{item.text}</Text>}
        renderSectionHeader={({ section }) => <Text>{section.title}</Text>}
      />,
    );
    expect(screen.getByText("Section A")).toBeTruthy();
    expect(screen.getByText("A1")).toBeTruthy();
    expect(screen.getByText("Section B")).toBeTruthy();
    expect(screen.getByText("B1")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// fireEvent patterns
// ---------------------------------------------------------------------------

describe("fireEvent patterns", () => {
  it("scroll event on ScrollView", () => {
    const onScroll = vi.fn();
    render(<ScrollView testID="sv" onScroll={onScroll} />);
    fireEvent.scroll(screen.getByTestId("sv"), {
      nativeEvent: { contentOffset: { x: 0, y: 100 } },
    });
    expect(onScroll).toHaveBeenCalled();
  });

  it("press on TouchableOpacity", () => {
    const onPress = vi.fn();
    render(
      <TouchableOpacity testID="to" onPress={onPress}>
        <Text>Tap</Text>
      </TouchableOpacity>,
    );
    fireEvent.press(screen.getByTestId("to"));
    expect(onPress).toHaveBeenCalled();
  });

  it("changeText on TextInput", () => {
    const onChangeText = vi.fn();
    render(<TextInput testID="ti" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByTestId("ti"), "hello");
    expect(onChangeText).toHaveBeenCalledWith("hello");
  });
});

// ---------------------------------------------------------------------------
// ActivityIndicator
// ---------------------------------------------------------------------------

describe("ActivityIndicator", () => {
  it("renders and is queryable", () => {
    render(<ActivityIndicator testID="loading" />);
    expect(screen.getByTestId("loading")).toBeTruthy();
  });
});
