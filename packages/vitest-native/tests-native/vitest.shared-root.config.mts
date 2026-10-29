// ADR-0003's shared-root fixture: an ios and an android project at the same root, each
// with its own plugin instance. Their contexts differ, and every file must run with its
// own, under the stock runtime (--mode stock) and the hot runtime (--mode hot).
// test:native:shared-root also runs the extends: true pair
// (vitest.shared-root-extends.config.mts).
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const root = import.meta.dirname + "/..";
const include = ["tests-native/shared-root/*.test.ts"];

const project = (platform: "ios" | "android", hot: boolean) => ({
  // `extends: false` so each inline project owns its plugin; root pinned to the same
  // directory for both.
  extends: false as const,
  root,
  plugins: [reactNative({ engine: "native", platform, hotRuntime: hot ? "auto" : false })],
  test: { name: platform, environment: "node", include, env: { VN_EXPECTED_PLATFORM: platform } },
});

export default defineConfig(({ mode }) => ({
  test: { projects: [project("ios", mode === "hot"), project("android", mode === "hot")] },
}));
