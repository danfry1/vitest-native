import * as React from "react";
import { Modal, Pressable, Text, View } from "react-native";

// A minimal, idiomatic dialog: a Modal with a pressable backdrop that dismisses.
// Mirrors the exact pattern paper's Dialog failed on under hot (backdrop press
// not firing onDismiss), but written plainly with host-element queries.
export function Dialog({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent onRequestClose={onDismiss}>
      <Pressable testID="backdrop" onPress={onDismiss} accessibilityRole="button" />
      <View testID="dialog-body">{children}</View>
    </Modal>
  );
}
