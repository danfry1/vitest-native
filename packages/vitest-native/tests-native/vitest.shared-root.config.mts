// ADR-0003's shared-root fixture, and a Vitest 5 inline-project pair.
//
// --mode stock / --mode hot: an ios and an android project at the same root, each with
// its own plugin instance. Their contexts differ (platform is in the context and in the
// resolver inputs), and every file must run with its own, under the stock runtime and
// the hot runtime.
//
// --mode extends: two inline `extends: true` projects inheriting one plugin from this
// config, the shape whose plugin test config Vitest 5 once dropped. Both must still
// get a context, for their own root.
//
// test:native:shared-root runs all three.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const root = import.meta.dirname + "/..";
const include = ["tests-native/shared-root/*.test.ts"];

const ownPlugin = (platform: "ios" | "android", hot: boolean) => ({
  // `extends: false` so each inline project owns its plugin; root pinned to the same
  // directory for both.
  extends: false as const,
  root,
  plugins: [reactNative({ engine: "native", platform, hotRuntime: hot ? "auto" : false })],
  test: { name: platform, environment: "node", include, env: { VN_EXPECTED_PLATFORM: platform } },
});

export default defineConfig(({ mode }) =>
  mode === "extends"
    ? {
        plugins: [reactNative({ engine: "native", platform: "android", hotRuntime: false })],
        test: {
          environment: "node",
          projects: ["a", "b"].map((name) => ({
            extends: true as const,
            test: { name, include, env: { VN_EXPECTED_PLATFORM: "android" } },
          })),
        },
      }
    : {
        test: {
          projects: [ownPlugin("ios", mode === "hot"), ownPlugin("android", mode === "hot")],
        },
      },
);
