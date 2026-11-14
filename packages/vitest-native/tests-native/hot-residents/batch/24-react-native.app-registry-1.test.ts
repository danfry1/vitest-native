import { AppRegistry } from "react-native";
import { test } from "vitest";

test("registers an app and leaves it", () => {
  AppRegistry.registerComponent("VNAudit", () => () => null);
});
