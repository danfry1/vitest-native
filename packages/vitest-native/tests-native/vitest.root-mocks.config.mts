// jest-compat applies a root __mocks__/<package> to node_modules packages with no
// jest.mock() call, as Jest does (jest-compat/root-mocks.ts). Rooted at root-mocks/, a
// fixture app whose __mocks__ also holds mocks that must not apply. `--mode hot` runs
// the files in one reused worker; `--mode user-setup` has the project's setup file load
// jest-compat itself, so a file's unmock must not leak into the next.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "hot" && mode !== "stock" && mode !== "user-setup") {
    throw new Error(`run with --mode hot, stock or user-setup (got '${mode}')`);
  }
  return {
    root: path.join(here, "root-mocks"),
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
      jestMockTransform({ roots: [".", "other-root", "../root-mocks-outside"] }),
    ],
    resolve: { alias: { ...jestCompatAliases() } },
    test: {
      environment: "node",
      globals: true,
      // user-setup: the project's own setup file loads jest-compat.
      setupFiles:
        mode === "user-setup"
          ? ["./setup-loads-compat.ts"]
          : [path.resolve(here, "../dist/jest-compat/setup.mjs"), "./setup.ts"],
      include: ["*.test.ts", "*.test.tsx"],
      ...(mode === "hot" ? { maxWorkers: 1, fileParallelism: false } : {}),
    },
  };
});
