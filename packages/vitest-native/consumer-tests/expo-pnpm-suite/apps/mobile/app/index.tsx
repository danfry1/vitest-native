import { Avatar } from "@suite/ui";
import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function Home() {
  return (
    <View>
      <Text>home screen</Text>
      <Avatar uri="https://example.test/me.png" />
      <Link href="/details/42">open details</Link>
    </View>
  );
}
