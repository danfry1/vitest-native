import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View } from "react-native";
import {
  Provider as PaperProvider,
  Portal, Modal, Dialog, Menu, Button, Text, Tooltip, IconButton,
  TouchableRipple, AnimatedFAB, Card,
} from "react-native-paper";

const wrap = (ui: React.ReactNode) => render(<PaperProvider>{ui}</PaperProvider>);

describe("react-native-paper advanced (Portal/animation) under native engine", () => {
  it("Portal + Modal renders content when visible", () => {
    wrap(
      <Portal>
        <Modal visible onDismiss={() => {}}>
          <Text>modal content</Text>
        </Modal>
      </Portal>,
    );
    expect(screen.getByText("modal content")).toBeTruthy();
  });

  it("Dialog renders title + content + actions when visible", () => {
    const onPress = vi.fn();
    wrap(
      <Portal>
        <Dialog visible onDismiss={() => {}}>
          <Dialog.Title>Confirm</Dialog.Title>
          <Dialog.Content><Text>Are you sure?</Text></Dialog.Content>
          <Dialog.Actions><Button onPress={onPress}>OK</Button></Dialog.Actions>
        </Dialog>
      </Portal>,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    fireEvent.press(screen.getByText("OK"));
    expect(onPress).toHaveBeenCalled();
  });

  it("Menu opens and shows items", () => {
    function MenuExample() {
      const [visible, setVisible] = React.useState(false);
      return (
        <Menu
          visible={visible}
          onDismiss={() => setVisible(false)}
          anchor={<Button onPress={() => setVisible(true)}>Open menu</Button>}
        >
          <Menu.Item onPress={() => {}} title="Item 1" />
          <Menu.Item onPress={() => {}} title="Item 2" />
        </Menu>
      );
    }
    wrap(<MenuExample />);
    fireEvent.press(screen.getByText("Open menu"));
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Item 2")).toBeTruthy();
  });

  it("Tooltip wraps a child", () => {
    wrap(
      <Tooltip title="Helpful tip">
        <IconButton icon="information" onPress={() => {}} testID="info" />
      </Tooltip>,
    );
    expect(screen.getByTestId("info")).toBeTruthy();
  });

  it("TouchableRipple onPress fires", () => {
    const onPress = vi.fn();
    wrap(
      <TouchableRipple onPress={onPress}>
        <Text>ripple</Text>
      </TouchableRipple>,
    );
    fireEvent.press(screen.getByText("ripple"));
    expect(onPress).toHaveBeenCalled();
  });

  it("Card.Content with Text variants", () => {
    wrap(
      <Card>
        <Card.Content>
          <Text variant="titleLarge">A Title</Text>
          <Text variant="bodyMedium">A paragraph</Text>
        </Card.Content>
      </Card>,
    );
    expect(screen.getByText("A Title")).toBeTruthy();
    expect(screen.getByText("A paragraph")).toBeTruthy();
  });

  it("nested Portal + AnimatedFAB (reanimated-backed) inside a tree", () => {
    wrap(
      <View>
        <Text>screen</Text>
        <Portal>
          <AnimatedFAB icon="plus" label="FAB" extended onPress={() => {}} />
        </Portal>
      </View>,
    );
    expect(screen.getByText("screen")).toBeTruthy();
    expect(screen.getByText("FAB")).toBeTruthy();
  });
});
