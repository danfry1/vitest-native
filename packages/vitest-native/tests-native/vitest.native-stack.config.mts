import { defineConfig } from "vitest/config";
import { presets, reactNative } from "../dist/index.mjs";

// The real @react-navigation/native-stack over the react-native-screens preset: what
// an app gets with `presets: { navigation: false }`, since it installs
// react-native-screens (native-stack's peer) and auto-detection turns that preset on.
// This workspace does not declare react-native-screens, so the presets are listed:
// screens, and safe-area-context as auto-detection would add it. The navigation
// preset is not among them, so native-stack runs as itself and renders through the
// screens preset's ScreenStackItem, which native-stack/header.test.tsx tests.
//
// `transform` names @react-navigation/elements because this workspace installs it
// only as native-stack's dependency. Under bun's isolated layout it does not resolve
// from this package, so ecosystem detection cannot read its manifest and leaves it
// to Node, which then loads its untranspiled ESM build.
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: false,
      presets: [presets.screens(), presets.safeAreaContext()],
      transform: ["@react-navigation/elements"],
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/native-stack/*.test.tsx"],
  },
});
