/**
 * A preset package's subpath whose leaf the mock does not export, reached by an ESM
 * import: the real module's exports (preset-subpath.test.tsx covers the same subpath by
 * require). In its own file because the subpath is TypeScript source that Vitest inlines:
 * a require and an import of it in one worker evaluate it twice, once by each module
 * system, which the ownership guard reports (SOURCE_EVALUATED_TWICE).
 */
import { expect, it } from "vitest";

it("an ESM import of a subpath whose leaf the mock does not export gets the real module's exports", async () => {
  const mod = await import("react-native-reanimated/src/common/style/propsBuilder");
  expect(mod.stylePropsBuilder).toBeDefined();
  expect((mod as Record<string, unknown>).useSharedValue).toBeUndefined();
});
