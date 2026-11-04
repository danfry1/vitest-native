// A React Native workspace library whose exports map does not list ./package.json.
import { Platform } from "react-native";
import { greet } from "./helper";

export { setValue, store } from "./store";
export const os = Platform.OS;
export function welcome(): string {
  return greet();
}
