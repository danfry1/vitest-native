// jest-compat's per-file registry with experimental.nodeMocks on (as ownershipModel
// 'resolution' turns it on): a jest.* call is applied to Node's require at once, so the
// vi.* call jestMockTransform also queues for the test's next import is no pending mock
// for Node (jest-compat/node-registry.mjs, state.decided). The jest-registry suites,
// otherwise as tests-native/vitest.config.mts runs them.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

export default defineConfig({
  ...base,
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: false,
      presets: { expo: true },
      experimental: { nodeMocks: true },
    }),
    jestMockTransform(OTHER_FIXTURES_MOCKS),
  ],
  test: { ...base.test, include: ["tests-native/jest-registry-*.test.ts"] },
});
