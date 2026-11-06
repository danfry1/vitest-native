// A project .js file with JSX, as React Native apps write them and Metro accepts.
import React from "react";
import { Text } from "react-native";

export function Greeting({ name }) {
  return <Text>Hello, {name}</Text>;
}
