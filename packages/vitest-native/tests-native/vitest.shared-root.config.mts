// ADR-0003's shared-root fixture, and the Vitest 5 inline-project pair: an ios and an
// android project at the same root, each with its own plugin instance. Their contexts
// differ (platform is in the context and in the resolver inputs), and every file must
// run with its own. Run under the stock runtime and the hot runtime
// (test:native:shared-root: --mode stock, then --mode hot).
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const project = (platform: "ios" | "android", hot: boolean) => ({
  // `extends: false` so each inline project owns its plugin; root pinned to the same
  // directory for both.
  extends: false as const,
  root: import.meta.dirname + "/..",
  plugins: [reactNative({ engine: "native", platform, hotRuntime: hot ? "auto" : false })],
  test: {
    name: platform,
    environment: "node",
    include: ["tests-native/shared-root/*.test.ts"],
    env: { VN_EXPECTED_PLATFORM: platform },
  },
});

export default defineConfig(({ mode }) => ({
  test: { projects: [project("ios", mode === "hot"), project("android", mode === "hot")] },
}));
