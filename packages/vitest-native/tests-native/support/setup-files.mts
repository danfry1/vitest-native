// The setup files of every config that runs the shared native suite
// (tests-native/*.test.ts{,x}): vitest.config.mts, vitest.forks.config.mts and
// vitest.hot.config.mts. One list, so a setup file a test depends on reaches every
// pool and runtime the suite runs under.
// - jest-compat setup provides the `jest` global + the __vnInteropMock helper the
//   jestMockTransform-wrapped factories call (exercised by jest-mock-hoist.test).
// - preset-readiness records whether presets finished preparing before user setup
//   files run (skia.test.tsx).
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const NATIVE_SUITE_SETUP_FILES = [
  path.resolve(here, "../../dist/jest-compat/setup.mjs"),
  path.resolve(here, "preset-readiness.setup.ts"),
];
