// ADR-0003's shared-root fixture: two projects, ios and android, at one root. Each
// file must run with its own project's context, and React Native must report that
// project's platform.
import { Platform } from "react-native";
import { expect, test } from "vitest";
import { projectContext } from "../../src/context.mjs";

test("runs with its own project's context and platform", () => {
  const expected = process.env.VN_EXPECTED_PLATFORM;
  expect(expected === "ios" || expected === "android").toBe(true);
  expect(projectContext()?.platform).toBe(expected);
  expect(projectContext()?.resolverInputs.platform).toBe(expected);
  expect(Platform.OS).toBe(expected);
});
