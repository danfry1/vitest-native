// A root __mocks__ manual mock (jest-compat/root-mocks.ts) of an ES-module package that
// Node-owned code imports, with experimental.nodeMocks on (#896). `require` cannot
// resolve the package's subpath (its `exports` has an `import` condition only), so the
// mock reaches Node through its ESM loader. `--mode hot` runs the files in one reused
// worker; `--mode resolver` adds experimental.ownershipModel 'resolver' to nodeMocks, and
// `--mode resolution` uses ownershipModel 'resolution', which implies nodeMocks.
import "./support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { setup as placeFixturePackages } from "./support/dispatch-fixtures.global.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
// jestMockTransform finds the root mocks when the config loads, and keeps only those of
// installed packages, so the fixture packages are placed first.
placeFixturePackages();

export default defineConfig(({ mode }) => {
  if (!["stock", "hot", "resolver", "resolution"].includes(mode)) {
    throw new Error(`run with --mode stock, hot, resolver or resolution (got '${mode}')`);
  }
  return {
    root: path.join(here, "root-mocks-esm"),
    plugins: [
      reactNative({
        engine: "native",
        // Fixture packages only: no library's own Jest setup registers mocks, so a file's
        // jest.* calls are the only registrations (unmock-every-root.test.ts).
        presets: [],
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
        experimental:
          mode === "resolution"
            ? { ownershipModel: "resolution" }
            : mode === "resolver"
              ? { ownershipModel: "resolver", nodeMocks: true }
              : { nodeMocks: true },
      }),
      jestMockTransform(),
    ],
    test: {
      environment: "node",
      globals: true,
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
      include: ["*.test.ts"],
      ...(mode === "hot" ? { maxWorkers: 1, fileParallelism: false } : {}),
    },
  };
});
