import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function Home() {
  return (
    <View>
      <Text>home screen</Text>
      <Link href="/details/42">open details</Link>
    </View>
  );
}
