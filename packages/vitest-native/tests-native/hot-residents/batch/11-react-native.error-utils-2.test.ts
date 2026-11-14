import { test } from "vitest";
import { observe } from "../audit";

type ErrorUtils = { getGlobalHandler(): { name?: string } | undefined };

test("observes", () => {
  const handler = (globalThis as unknown as { ErrorUtils: ErrorUtils }).ErrorUtils.getGlobalHandler();
  observe("react-native.error-utils", { earlierHandler: handler?.name === "vnAuditHandler" });
});
