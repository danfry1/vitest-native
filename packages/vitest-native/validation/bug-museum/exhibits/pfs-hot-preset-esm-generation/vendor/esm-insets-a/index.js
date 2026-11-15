// An ES module library that reads the safe-area insets, as a UI kit's ES build does.
import * as safeArea from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export { safeArea };
export const topInset = () => useSafeAreaInsets().top;
