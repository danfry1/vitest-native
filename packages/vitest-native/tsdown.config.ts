import { defineConfig, type UserConfig } from "tsdown";
import fs from "node:fs";
import path from "node:path";
import { VERBATIM_DIRS, isVerbatimRuntimeFile } from "./scripts/verbatim-runtime.mjs";

const shared = {
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "react",
      "react-native",
      "vitest",
      "vitest/node",
      "vite",
      "magic-string",
      "@testing-library/react-native",
      "@testing-library/react-native/build/matchers/extend-expect",
      "@testing-library/react-native/build/matchers",
      "react-test-renderer",
      // The project context ships verbatim (copied below) and every bundle imports
      // that one file: one module instance per realm, and no inlined copies.
      /[\\/]src[\\/]context\.mjs$/,
    ],
  },
} satisfies UserConfig;

// The matcher declarations augment the "vitest" module. Under Vitest 4 that
// augmentation only merges when the declaration file itself references vitest, and
// declaration bundling drops both an unused type import and a `reference types`
// directive from the source — so add the directive to the emitted file.
function referenceVitest(file: string): void {
  const target = path.resolve("dist", file);
  if (!fs.existsSync(target)) return;
  const text = fs.readFileSync(target, "utf8");
  const directive = '/// <reference types="vitest" />';
  if (!text.startsWith(directive)) fs.writeFileSync(target, `${directive}\n${text}`);
}

// Every runtime .mjs the ESM build ships verbatim (copied by build:done below): the
// top-level ones, native/ and jest-compat/. The bundles import those files rather than
// inline a copy of them, so a process that loads both a bundle and the shipped runtime
// (the plugin's process loads the registry and Metro profile modules from dist/native)
// holds one instance of each module, with one set of caches. native/memory.mjs is the
// exception: it ships only as a chunk. The CommonJS build keeps its copy, because a
// require() of these ESM files would need require(esm) from every consumer.
const VERBATIM_RUNTIME =
  /[\\/]src[\\/](?:native[\\/](?!memory\.mjs$)|jest-compat[\\/])?[^\\/]+\.mjs$/;

export default defineConfig([
  {
    ...shared,
    deps: { neverBundle: [...shared.deps.neverBundle, VERBATIM_RUNTIME] },
    entry: {
      index: "src/index.ts",
      helpers: "src/helpers.ts",
      setup: "src/setup.ts",
      serializer: "src/serializer.ts",
      presets: "src/presets/index.ts",
      matchers: "src/matchers/animated.ts",
      "jest-compat": "src/jest-compat/index.ts",
      cli: "src/cli/index.ts",
    },
    format: "esm",
    hooks: {
      // The native runtime + jest-compat shims are plain .mjs loaded by Node at
      // runtime (native: via module.registerHooks; jest-compat: as setup file / alias
      // targets resolved by Vite), so they must ship verbatim rather than bundled.
      "build:done": () => {
        referenceVitest("matchers.d.mts");
        // The runtime .mjs files and their hand-written .d.mts stubs ship verbatim
        // (scripts/verbatim-runtime.mjs, which check:size reads too). That includes the
        // top-level ones (errors.mjs): the shipped runtimes import them by relative path,
        // and the tests load those same files from src, so each must resolve in both
        // trees as one module rather than a bundled copy.
        for (const sub of VERBATIM_DIRS) {
          const srcDir = path.resolve("src", sub);
          const outDir = path.resolve("dist", sub);
          fs.mkdirSync(outDir, { recursive: true });
          for (const f of fs.readdirSync(srcDir)) {
            if (isVerbatimRuntimeFile(sub, f)) {
              fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
            }
          }
        }
      },
    },
  },
  {
    // CommonJS only for the entries `exports` resolves require() to. The others —
    // the root entry, setup and presets — depend on vitest at module scope, and vitest
    // throws when it is reached through require(), so `exports` points both conditions
    // at the .mjs build, which Node loads through require(esm). The CLI is reached
    // only through `bin`, which names cli.mjs. A CommonJS build of any of them, and the
    // chunks only they share, would ship files no declared entry can reach.
    ...shared,
    entry: {
      helpers: "src/helpers.ts",
      serializer: "src/serializer.ts",
      matchers: "src/matchers/animated.ts",
      "jest-compat": "src/jest-compat/index.ts",
    },
    format: "cjs",
    hooks: {
      "build:done": () => referenceVitest("matchers.d.cts"),
    },
  },
]);
