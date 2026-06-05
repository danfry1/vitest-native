import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
const here = import.meta.dirname;
export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: {
    dedupe: ["react", "react-test-renderer", "react-is"],
    alias: {
      // The bakeoff dir IS the paper repo (self-import needs an exports field it
      // lacks), and lib/ isn't built — so resolve the package to its TS source,
      // exactly what Vite would transform for a source consumer.
      "react-native-paper": path.join(here, "src/index.tsx"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["vn-paper/**/*.test.tsx"],
  },
});
