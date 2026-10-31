// Partial mocks of project source that `server.deps.external` names, under the native
// engine. The engine's ownership policy gives project source inside the project's own
// directories to Vite before Vitest's external patterns are consulted, so the
// factory's jest.requireActual still loads through Vite and shares the app's store
// (jest-compat/transform.ts, isViteOwnedSource).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// Vitest externalizes what server.deps.external names, so the test's own import of the
// .ts fixture goes to Node, which runs TypeScript only from 22.18 (type stripping).
// Older Node cannot load the fixture at all, whatever the transform does.
const nodeRunsTypeScript = Boolean((process.features as { typescript?: unknown }).typescript);

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    // Relative: an absolute include is a glob that matches nothing on Windows.
    include: !nodeRunsTypeScript
      ? []
      : [
          "tests-native/partial-mock-via-app.test.ts",
          "tests-native/partial-mock-mutate-actual.test.ts",
        ],
    passWithNoTests: !nodeRunsTypeScript,
    server: { deps: { external: [/fixtures[\\/]partial-mock[\\/]/] } },
  },
});
