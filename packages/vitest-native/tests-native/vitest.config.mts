import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  // A tsconfig-paths-style alias, which jest.requireActual must honour too
  // (requireactual-alias.test.tsx).
  resolve: { alias: { "@vn-app": path.resolve(here, "fixtures/alias-app") } },
  test: {
    // A temporary root per run, removed afterwards (see the file).
    globalSetup: [path.resolve(here, "../tests/support/temp-root.global.ts")],
    globals: true,
    environment: "node",
    // jest-compat setup provides the `jest` global + the __vnInteropMock helper the
    // jestMockTransform-wrapped factories call (exercised by jest-mock-hoist.test).
    // preset-readiness records whether presets finished preparing before user setup
    // files run (skia.test.tsx).
    setupFiles: [
      path.resolve(here, "../dist/jest-compat/setup.mjs"),
      path.resolve(here, "support/preset-readiness.setup.ts"),
    ],
    include: [
      "tests-native/*.test.tsx",
      "tests-native/*.test.ts",
      // A test file under a directory named jest-compat (see its header).
      "tests-native/jest-compat/*.test.ts",
    ],
    // android.test.ts needs platform:'android'; navigation-params needs the explicit
    // navigation preset config — both have their own dedicated config files.
    exclude: ["tests-native/android.test.ts", "tests-native/navigation-params.test.tsx"],
    // Force the fixture lib to be externalized (loaded through Node, like a real
    // node_modules dep) instead of inlined — so its `import { Appearance } from
    // 'react-native'` exercises the loader's ESM facade. See
    // ext-rn-named-import.test.ts.
    // Force the fixtures external (loaded through Node, like Vitest externalizes
    // valid-node-import node_modules deps by default) so they exercise the loader.
    // ext-platform-lib covers platform-extension resolution + ESM asset + ESM JSON.
    server: { deps: { external: ["ext-rn-named-lib", "ext-platform-lib"] } },
  },
});
