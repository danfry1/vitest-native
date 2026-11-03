import { Image } from "expo-image";

export function Avatar({ uri }: { uri: string }) {
  return <Image testID="avatar" source={{ uri }} style={{ width: 32, height: 32 }} />;
}
