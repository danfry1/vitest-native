// The ownership guard's exemptions for the shared native suite (docs/ownership-guard.md).
// Every entry is a real dual evaluation the suite makes on purpose, with the reason it
// is deliberate. Anything else the guard reports fails the suite under CI's
// VITEST_NATIVE_OWNERSHIP_MODE=error.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const NATIVE_SUITE_OWNERSHIP = {
  allow: [
    {
      path: path.resolve(here, "../fixtures/alias-app/registry/counter.ts"),
      reason:
        "jest-registry-isolate-modules.test.ts loads the counter through require() and " +
        "import() on purpose. jest-compat can share Vite's instance with a later require, " +
        "but not the reverse, and not inside an isolateModules block, so this file holds " +
        "two copies. A known jest-compat gap, pinned by that test.",
    },
  ],
};
