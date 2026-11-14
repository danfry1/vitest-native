import { test } from "vitest";
import { mockNativeModule } from "vitest-native/helpers";

test("registers a native module and leaves it", () => {
  mockNativeModule("VNAuditModule", { ping: () => "pong" });
});
