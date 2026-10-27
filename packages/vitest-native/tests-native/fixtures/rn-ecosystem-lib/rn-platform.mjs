// An `.mjs` file that needs the engine: it imports React Native, whose Flow source only
// the engine compiles, and it has JSX.
import { Platform, View } from "react-native";

export const os = Platform.OS;
export const tree = <View testID="from-mjs" />;
