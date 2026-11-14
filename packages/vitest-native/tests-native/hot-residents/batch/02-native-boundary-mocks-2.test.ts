import { NativeModules } from "react-native";
import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  const stub = NativeModules.Vibration as unknown as { answer?: () => unknown };
  observe("native-boundary-mocks", { earlierMethod: stub?.answer?.() === 42 });
});
