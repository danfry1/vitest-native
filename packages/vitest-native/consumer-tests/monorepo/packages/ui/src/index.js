// A workspace library as they are actually published: untranspiled source behind the
// react-native field, a compiled build behind main, and module-level state.
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
