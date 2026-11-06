// Project source in .js with JSX, imported by a .js test.
import { Text } from "react-native";

export function Greeting({ name }) {
  return <Text>Hello {name}</Text>;
}

// The stack of an error made on a known line, to check the sourcemap: line 10.
export function stackHere() {
  return new Error("here").stack;
}
