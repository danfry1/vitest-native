import { Platform } from "react-native";

// Design tokens a sibling package aliases into without declaring this package.
export const spacing: number = Platform.select({ ios: 8, android: 10, default: 8 });
