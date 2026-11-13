import { Text } from "react-native";

export function Greeting({ name }: { name: string }) {
  return <Text>Hello, {name}</Text>;
}
