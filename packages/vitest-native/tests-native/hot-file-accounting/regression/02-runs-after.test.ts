import { Appearance } from "react-native";
import { expect, test } from "vitest";

// Must be reported. Before the node-mocks entry was ordered ahead of the React Native
// restores, this file was dropped from the run without a test result.
test("runs after a file that mocked Appearance away", () => {
  expect(typeof Appearance.getColorScheme).toBe("function");
});
