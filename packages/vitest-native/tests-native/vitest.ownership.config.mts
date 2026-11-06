// The native suite with experimental.ownershipModel: 'resolver' on (ADR-0004/0005):
// the same files as vitest.config.mts, plus the identity probes in ownership/, under
// per-file isolation (`--mode stock`) and the hot runtime (`--mode hot`). A teardown
// setup file fails any file whose realms counted a resolver fallback outside
// FALLBACK_ALLOWED, so a silent fall back to the old resolution cannot pass.
//
// `--mode off` runs only the identity probes with the flag off: the control that
// shows they fail without the shared resolver (scripts/test-ownership-control.mjs).
// `--mode shadow` runs only the shadow probe, with `diagnostics` on: the shadow is
// written under diagnostics only. `--mode resolution` and `resolution-hot` run the
// stock and hot sets with 'resolution' (the require bridge).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { NATIVE_SUITE_SETUP_FILES } from "./support/setup-files.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const off = mode === "off";
  const shadow = mode === "shadow";
  // `--mode resolution` / `resolution-hot`: the same files with 'resolution', the require
  // bridge on: nothing here requires a file Vite owns first, so nothing may change.
  const resolution = mode === "resolution" || mode === "resolution-hot";
  if (off) process.env.VN_OWNERSHIP_FLAG = "off";
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" || mode === "resolution-hot",
        presets: { expo: true },
        ...(shadow ? { diagnostics: true } : {}),
        ...(off
          ? {}
          : { experimental: { ownershipModel: resolution ? "resolution" : "resolver" } }),
      }),
      jestMockTransform(OTHER_FIXTURES_MOCKS),
    ],
    resolve: { alias: { "@vn-app": path.resolve(here, "fixtures/alias-app") } },
    test: {
      globalSetup: [
        path.resolve(here, "../tests/support/temp-root.global.ts"),
        path.resolve(here, "ownership/fixtures.global.ts"),
        path.resolve(here, "support/dispatch-fixtures.global.ts"),
        ...(off ? [] : [path.resolve(here, "ownership/vite-realm.global.ts")]),
      ],
      globals: true,
      environment: "node",
      setupFiles: [
        ...NATIVE_SUITE_SETUP_FILES,
        ...(off ? [] : [path.resolve(here, "ownership/no-fallbacks.setup.ts")]),
      ],
      include: off
        ? ["tests-native/ownership/*.test.ts"]
        : shadow
          ? ["tests-native/ownership/shadow.test.ts"]
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
        // Needs diagnostics: it runs in --mode shadow.
        ...(shadow ? [] : ["tests-native/ownership/shadow.test.ts"]),
        // Asserts diagnostics is off: --mode off runs the flag off, where it is moot.
        ...(off ? ["tests-native/ownership/no-shadow.test.ts"] : []),
      ],
      server: { deps: { external: ["ext-rn-named-lib", "ext-platform-lib"] } },
    },
  };
});
