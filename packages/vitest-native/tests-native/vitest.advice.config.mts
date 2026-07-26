import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

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
    include: [path.resolve(here, "advice/*.test.ts")],
  },
});
