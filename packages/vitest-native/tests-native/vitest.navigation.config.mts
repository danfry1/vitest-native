import { defineConfig } from "vitest/config";
import { presets, reactNative } from "../dist/index.mjs";

// Explicit preset with configured route params. Preset options must survive the
// main-process → worker boundary via the preset's serializable `config` (presets
// are rebuilt in-worker from their name). See navigation-params.test.tsx.
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      presets: [presets.navigation({ defaultRouteParams: { id: "42", mode: "edit" } })],
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/navigation-params.test.tsx"],
  },
});
