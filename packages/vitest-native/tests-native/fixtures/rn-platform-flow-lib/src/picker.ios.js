// A Flow type import in a PLATFORM VARIANT — the exact shape that failed to compile:
//   node_modules/@react-native-community/datetimepicker/src/datetimepicker.ios.js:23:13
import type { PickerEvent } from "./types";
export const platform = "ios";
export function pick(): PickerEvent | null {
  return null;
}
