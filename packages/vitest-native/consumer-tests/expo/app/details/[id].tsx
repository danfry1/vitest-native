import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>details for {id}</Text>;
}
