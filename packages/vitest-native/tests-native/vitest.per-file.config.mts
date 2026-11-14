// The native suite with React Native loaded file by file, as a cold run's first files
// load it while the precompiled registry builds in the background (registryBuild's
// default). The main config builds the registry first, so without this lane CI would
// never run the per-file path. The files left out assert the registry itself, or run an
// app of their own, whose config this one does not reach (support/spawns-own-run.mts).
import { mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";
import { SPAWNS_OWN_RUN } from "./support/spawns-own-run.mts";

process.env.VITEST_NATIVE_NO_REGISTRY = "1";

export default mergeConfig(base, {
  test: {
    exclude: [
      "tests-native/registry.test.ts",
      "tests-native/registry-identity.test.ts",
      "tests-native/library-registry.test.tsx",
      ...SPAWNS_OWN_RUN,
    ],
  },
});
