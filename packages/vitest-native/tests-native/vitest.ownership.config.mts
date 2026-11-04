// The native suite with experimental.ownershipModel: 'resolver' on (ADR-0004/0005):
// the same files as vitest.config.mts, plus the identity probes in ownership/, under
// per-file isolation (`--mode stock`) and the hot runtime (`--mode hot`). A teardown
// setup file fails any file whose realms counted a resolver fallback outside
// FALLBACK_ALLOWED, so a silent fall back to the old resolution cannot pass.
//
// `--mode off` runs only the identity probes with the flag off: the control that
// shows they fail without the shared resolver (scripts/test-ownership-control.mjs).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { NATIVE_SUITE_SETUP_FILES } from "./support/setup-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const off = mode === "off";
  if (off) process.env.VN_OWNERSHIP_FLAG = "off";
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot",
        presets: { expo: true },
        ...(off ? {} : { experimental: { ownershipModel: "resolver" } }),
      }),
      jestMockTransform(),
    ],
    resolve: { alias: { "@vn-app": path.resolve(here, "fixtures/alias-app") } },
    test: {
      globalSetup: [
        path.resolve(here, "../tests/support/temp-root.global.ts"),
        path.resolve(here, "ownership/fixtures.global.ts"),
      ],
      globals: true,
      environment: "node",
      setupFiles: [
        ...NATIVE_SUITE_SETUP_FILES,
        ...(off ? [] : [path.resolve(here, "ownership/no-fallbacks.setup.ts")]),
      ],
      include: off
        ? ["tests-native/ownership/*.test.ts"]
        : [
            "tests-native/*.test.tsx",
            "tests-native/*.test.ts",
            "tests-native/jest-compat/*.test.ts",
            "tests-native/ownership/*.test.ts",
          ],
      exclude: [
        "tests-native/android.test.ts",
        "tests-native/navigation-params.test.tsx",
        // Asserts the flag is off: it runs in the default suite.
        "tests-native/ownership-off.test.ts",
      ],
      server: { deps: { external: ["ext-rn-named-lib", "ext-platform-lib"] } },
    },
  };
});
