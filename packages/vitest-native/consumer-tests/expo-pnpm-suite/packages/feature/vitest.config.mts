import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// A workspace package shaped like a real monorepo's:
//   - it runs a sibling library's setup file (@suite/ui's vitest.setup.ts), by path;
//   - it imports that library's source through an alias, not the package entry;
//   - it aliases into another sibling (@suite/tokens) it does not declare;
//   - it declares neither `expo` nor `expo-image`: the Avatar it renders loads them
//     through @suite/ui. (pnpm may still make `expo` resolvable from here, as a peer.)
const ui = path.resolve(import.meta.dirname, "../ui");
export default defineConfig({
  plugins: [
    reactNative({ engine: "native", hotRuntime: process.env.VN_HOT === "auto" ? "auto" : false }),
  ],
  resolve: {
    alias: {
      "@suite/ui-src": path.join(ui, "src"),
      "@suite/tokens": path.resolve(import.meta.dirname, "../tokens/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.tsx"],
    setupFiles: [path.join(ui, "vitest.setup.ts")],
  },
});
