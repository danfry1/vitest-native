---
"vitest-native": patch
---

**`hotRuntime.freshRuntime` now declines, with one line naming the presets, while a preset whose module uses React is active, instead of failing later files with "Invalid hook call".** Those presets' modules keep the first file's React, so under `freshRuntime` every later file on a hot worker failed with "Invalid hook call" or read a default value (navigation's `useTheme` returned `DefaultTheme`). The affected presets are navigation, expo, screens, svg, vector-icons, webview, mmkv, unistyles, flash-list, gesture-handler, reanimated and bottom-sheet, and safe-area and keyboard-controller when the installed library ships no built Jest mock (such as `react-native-safe-area-context` before 5.8.1, which Expo SDK 57 pins). React then stays resident, as without `freshRuntime`. No action needed.
