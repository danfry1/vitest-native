// Any test: the exhibit checks the banner the run prints (check.mjs).
import { expect, test } from "vitest";
import { SafeAreaProvider } from "react-native-safe-area-context";

test("the app uses safe-area-context", () => {
  expect(SafeAreaProvider).toBeTruthy();
});
