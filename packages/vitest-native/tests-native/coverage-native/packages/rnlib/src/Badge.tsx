import { Text } from "react-native";

type Props = { label: string; loud?: boolean };

export function Badge({ label, loud }: Props) {
  if (loud) {
    return <Text>{label.toUpperCase()}</Text>;
  }
  return <Text>{label}</Text>;
}

export function unusedBadge(): null {
  return null;
}
