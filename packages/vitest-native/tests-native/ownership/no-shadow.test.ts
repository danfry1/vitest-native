// Without diagnostics there is no resolution shadow: it resolves each distinct request a
// second time, the old way, so it is paid only when asked for. The request below is one
// the shadow records (shadow.test.ts, --mode shadow).
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { resolverCounters } from "../../src/native/shared-resolver.mjs";

const require = createRequire(import.meta.url);

test("no shadow is computed without diagnostics", () => {
  expect(require("generic-mainfield-lib").entry).toBe("react-native-field");
  expect(resolverCounters()?.cjs?.calls ?? 0).toBeGreaterThan(0);
  expect(resolverCounters()?.cjs?.deltas).toBe(0);
});
