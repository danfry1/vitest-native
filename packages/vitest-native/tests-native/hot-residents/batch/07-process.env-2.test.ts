import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  observe("process.env", { earlierEnv: process.env.VN_AUDIT_ENV ?? null });
});
