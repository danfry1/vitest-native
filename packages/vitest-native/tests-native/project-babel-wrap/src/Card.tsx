import { Text, View } from "react-native";

// A plain component: nothing here needs the project's Babel config.
export class Card {
  static title = "card";
  label(): string {
    return Card.title;
  }
}
export const CardView = ({ label }: { label: string }) => (
  <View>
    <Text>{label}</Text>
  </View>
);
