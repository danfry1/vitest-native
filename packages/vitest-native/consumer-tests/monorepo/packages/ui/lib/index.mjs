// The ESM build. Vite prefers `module`, Node reads `main` — if the two disagree, the
// app configures one copy of this state and renders the other.
import React from "react";
import { Text } from "react-native";
const store = { translator: undefined };
export function configureTranslator(fn) {
  store.translator = fn;
}
export function translate(key) {
  return store.translator ? store.translator(key) : "";
}
export const Label = ({ id }) => React.createElement(Text, { testID: "label" }, translate(id));
