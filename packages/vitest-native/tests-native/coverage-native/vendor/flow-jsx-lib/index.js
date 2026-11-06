/**
 * @flow
 */
import type { Node } from "react";
import { Text } from "react-native";

type Props = {| label: string |};

export function Label(props: Props): Node {
  return <Text>{props.label}</Text>;
}

export function flowAdd(a: number, b: number): number {
  return a + b;
}
