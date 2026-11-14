import { AppRegistry } from "react-native";
import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  observe("react-native.app-registry", {
    registered: AppRegistry.getAppKeys().includes("VNAudit"),
  });
});
