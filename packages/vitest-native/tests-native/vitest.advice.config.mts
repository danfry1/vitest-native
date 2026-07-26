import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

// The config a user ends up with after following the explainer's advice verbatim.
// It has to live in its own file: the same fixture must stay UNtransformed under
// tests-native/vitest.config.mts, where explain-untransformed.test.ts asserts the
// error. One config proves the diagnosis, this one proves the cure.
export default defineConfig({
  plugins: [reactNative({ engine: "native", transform: ["untranspiled-jsx-lib"] })],
  test: {
    globals: true,
    environment: "node",
    // Its own directory, so the main config's `tests-native/*.test.ts` glob — which
    // is not recursive — cannot pick these up and contradict itself.
    //
    // Relative, like every other config here. An absolute path breaks on Windows:
    // include entries are globs and tinyglobby reads a backslash as an escape
    // character, so a resolved Windows path matches nothing and the run exits with
    // "No test files found" — which is how the first version of this file failed.
    include: ["tests-native/advice/*.test.ts"],
  },
});
