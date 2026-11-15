'use client'

// src/badge.tsx
import * as React from "react";
import { Text, View } from "react-native";
var Root = ({ children, ...viewProps }) => {
  return <View accessibilityRole="text" {...viewProps}>{children}</View>;
};
Root.displayName = "RootBadge";
var Label = ({ children }) => <Text>{children}</Text>;
Label.displayName = "LabelBadge";
export {
  Label,
  Root
};
