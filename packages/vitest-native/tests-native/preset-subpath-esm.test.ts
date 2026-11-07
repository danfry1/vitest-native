/**
 * A preset package's subpath whose leaf the mock does not export, reached by an ESM
 * import: the real module's exports (preset-subpath.test.tsx covers the same subpath by
 * require). In its own file because the subpath is TypeScript source that Vitest inlines:
 * a require and an import of it in one worker evaluate it twice, once by each module
 * system, which the ownership guard reports (SOURCE_EVALUATED_TWICE).
 */
import { beforeAll, expect, it } from "vitest";
import { COLD_IMPORT_BUDGET_MS } from "./support/cold-import";

// The import compiles reanimated's TypeScript source graph: cold on a fresh runner.
let mod: Record<string, unknown>;
beforeAll(async () => {
  mod = await import("react-native-reanimated/src/common/style/propsBuilder");
}, COLD_IMPORT_BUDGET_MS);

it("an ESM import of a subpath whose leaf the mock does not export gets the real module's exports", () => {
  expect(mod.stylePropsBuilder).toBeDefined();
  expect(mod.useSharedValue).toBeUndefined();
});
