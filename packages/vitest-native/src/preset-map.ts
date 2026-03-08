/**
 * Map of npm package names to their built-in preset export names.
 * Shared between plugin.ts (Vite main process) and setup.ts (Vitest workers).
 */
export const AUTO_DETECT_PRESETS: Record<string, string> = {
  "react-native-reanimated": "reanimated",
  "react-native-gesture-handler": "gestureHandler",
  "react-native-safe-area-context": "safeAreaContext",
  "@react-navigation/native": "navigation",
  "@react-navigation/native-stack": "navigation",
  "@react-navigation/bottom-tabs": "navigation",
  "@react-navigation/elements": "navigation",
  "@react-native-async-storage/async-storage": "asyncStorage",
  "react-native-screens": "screens",
  "expo-constants": "expo",
};
