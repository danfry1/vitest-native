import { NativeModules } from "react-native";
import { test } from "vitest";

test("gives a native module stub a method and leaves it", () => {
  const stub = NativeModules.Vibration as unknown as Record<string, unknown>;
  stub.answer = () => 42;
});
