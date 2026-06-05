import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import {
  Provider as PaperProvider,
  Button, Text, Card, Chip, Appbar, TextInput, Switch, Badge, Banner,
  ActivityIndicator, Divider, ProgressBar, Surface, IconButton, FAB,
  Checkbox, RadioButton, Searchbar, Snackbar, List, Avatar, SegmentedButtons,
  DataTable, AnimatedFAB, ToggleButton, Tooltip,
} from "react-native-paper";

const wrap = (ui: React.ReactNode) => render(<PaperProvider>{ui}</PaperProvider>);

describe("react-native-paper components under native engine", () => {
  it("Button renders + onPress fires", () => {
    const onPress = vi.fn();
    wrap(<Button onPress={onPress}>Tap</Button>);
    fireEvent.press(screen.getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("Text renders", () => {
    wrap(<Text>plain text</Text>);
    expect(screen.getByText("plain text")).toBeTruthy();
  });

  it("Card.Title + Card.Content render", () => {
    wrap(
      <Card>
        <Card.Title title="Card Title" subtitle="Sub" />
        <Card.Content><Text>card body</Text></Card.Content>
      </Card>,
    );
    expect(screen.getByText("Card Title")).toBeTruthy();
    expect(screen.getByText("card body")).toBeTruthy();
  });

  it("Chip renders + onClose fires", () => {
    const onClose = vi.fn();
    wrap(<Chip onClose={onClose} testID="chip">Chippy</Chip>);
    expect(screen.getByText("Chippy")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Appbar.Header + Appbar.Content render title", () => {
    wrap(<Appbar.Header><Appbar.Content title="My Screen" /></Appbar.Header>);
    expect(screen.getByText("My Screen")).toBeTruthy();
  });

  it("TextInput onChangeText fires", () => {
    const onChangeText = vi.fn();
    wrap(<TextInput label="Name" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByDisplayValue(""), "hello");
    expect(onChangeText).toHaveBeenCalledWith("hello");
  });

  it("Switch toggles via onValueChange", () => {
    const onValueChange = vi.fn();
    wrap(<Switch value={false} onValueChange={onValueChange} testID="sw" />);
    fireEvent(screen.getByTestId("sw"), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("Badge renders content", () => {
    wrap(<Badge>5</Badge>);
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("Banner renders visible content", () => {
    wrap(<Banner visible actions={[]}>Banner message</Banner>);
    expect(screen.getByText("Banner message")).toBeTruthy();
  });

  it("ActivityIndicator renders when animating", () => {
    wrap(<ActivityIndicator animating testID="spinner" />);
    expect(screen.getByTestId("spinner")).toBeTruthy();
  });

  it("Divider renders", () => {
    wrap(<Divider testID="divider" />);
    expect(screen.getByTestId("divider")).toBeTruthy();
  });

  it("ProgressBar renders", () => {
    wrap(<ProgressBar progress={0.5} testID="progress" />);
    expect(screen.getByTestId("progress")).toBeTruthy();
  });

  it("Surface renders children", () => {
    wrap(<Surface testID="surface"><Text>on surface</Text></Surface>);
    expect(screen.getByText("on surface")).toBeTruthy();
  });

  it("IconButton onPress fires", () => {
    const onPress = vi.fn();
    wrap(<IconButton icon="camera" onPress={onPress} testID="iconbtn" />);
    fireEvent.press(screen.getByTestId("iconbtn"));
    expect(onPress).toHaveBeenCalled();
  });

  it("FAB onPress fires", () => {
    const onPress = vi.fn();
    wrap(<FAB icon="plus" onPress={onPress} label="Add" />);
    fireEvent.press(screen.getByText("Add"));
    expect(onPress).toHaveBeenCalled();
  });

  it("Checkbox onPress fires", () => {
    const onPress = vi.fn();
    wrap(<Checkbox status="unchecked" onPress={onPress} testID="cb" />);
    fireEvent.press(screen.getByTestId("cb"));
    expect(onPress).toHaveBeenCalled();
  });

  it("RadioButton.Group selection", () => {
    const onValueChange = vi.fn();
    wrap(
      <RadioButton.Group onValueChange={onValueChange} value="a">
        <RadioButton.Item label="Option A" value="a" />
        <RadioButton.Item label="Option B" value="b" />
      </RadioButton.Group>,
    );
    expect(screen.getByText("Option A")).toBeTruthy();
    fireEvent.press(screen.getByText("Option B"));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("Searchbar onChangeText fires", () => {
    const onChangeText = vi.fn();
    wrap(<Searchbar value="" onChangeText={onChangeText} placeholder="Search" />);
    fireEvent.changeText(screen.getByPlaceholderText("Search"), "query");
    expect(onChangeText).toHaveBeenCalledWith("query");
  });

  it("Snackbar renders when visible", () => {
    wrap(<Snackbar visible onDismiss={() => {}}>Saved!</Snackbar>);
    expect(screen.getByText("Saved!")).toBeTruthy();
  });

  it("List.Item renders title + onPress", () => {
    const onPress = vi.fn();
    wrap(<List.Item title="List item" onPress={onPress} />);
    fireEvent.press(screen.getByText("List item"));
    expect(onPress).toHaveBeenCalled();
  });

  it("Avatar.Text renders label", () => {
    wrap(<Avatar.Text size={48} label="AB" />);
    expect(screen.getByText("AB")).toBeTruthy();
  });

  it("SegmentedButtons renders + selects", () => {
    const onValueChange = vi.fn();
    wrap(
      <SegmentedButtons
        value="w"
        onValueChange={onValueChange}
        buttons={[
          { value: "w", label: "Walk" },
          { value: "t", label: "Transit" },
        ]}
      />,
    );
    expect(screen.getByText("Walk")).toBeTruthy();
    fireEvent.press(screen.getByText("Transit"));
    expect(onValueChange).toHaveBeenCalledWith("t");
  });

  it("DataTable renders rows", () => {
    wrap(
      <DataTable>
        <DataTable.Header>
          <DataTable.Title>Name</DataTable.Title>
        </DataTable.Header>
        <DataTable.Row>
          <DataTable.Cell>Alice</DataTable.Cell>
        </DataTable.Row>
      </DataTable>,
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });


  it("ToggleButton onPress fires", () => {
    const onPress = vi.fn();
    wrap(<ToggleButton icon="bold" value="bold" onPress={onPress} testID="toggle" />);
    fireEvent.press(screen.getByTestId("toggle"));
    expect(onPress).toHaveBeenCalled();
  });

  it("AnimatedFAB renders (reanimated-backed)", () => {
    wrap(<AnimatedFAB icon="plus" label="Animated" extended onPress={() => {}} />);
    expect(screen.getByText("Animated")).toBeTruthy();
  });
});
