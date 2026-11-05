// An Expo app on `nativeModules: 'permissive'` imports expo, which reads
// NativeModules.EXDevLauncher (expo-constants parses its manifestString when present).
import { NativeModules } from "react-native";
import { expect, test } from "vitest";

test("expo imports, and EXDevLauncher is absent as in Expo Go", async () => {
  await import("expo");
  expect(NativeModules.EXDevLauncher, "EXDevLauncher is absent").toBeUndefined();
});
