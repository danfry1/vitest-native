// The native suite with React Native loaded file by file, as a cold run's first files
// load it while the precompiled registry builds in the background (registryBuild's
// default). The main config builds the registry first, so without this lane CI would
// never run the per-file path. The files left out assert the registry itself.
import { mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

process.env.VITEST_NATIVE_NO_REGISTRY = "1";

export default mergeConfig(base, {
  test: {
    exclude: [
      "tests-native/registry.test.ts",
      "tests-native/registry-identity.test.ts",
      "tests-native/library-registry.test.tsx",
      "tests-native/node-dispatch-precedence.test.ts",
    ],
  },
});
