import { test } from "vitest";
import { NativeModules } from "react-native";
import { observe } from "../audit";

test("observes", () => {
  observe("native-module-mocks", { registered: NativeModules.VNAuditModule != null });
});
