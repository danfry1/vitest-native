import { defineConfig, type UserConfig } from "tsdown";
import fs from "node:fs";
import path from "node:path";

// Runtime modules ship verbatim: Node loads them as files (the native engine's hooks,
// jest-compat's setup files and alias targets), so they are copied into dist rather
// than bundled. The memory planner is the exception: it is a config/doctor module,
// emitted as a code-split chunk and never loaded as a file, so it is not copied.
const VERBATIM_DIRS = ["", "native", "jest-compat"];
const NOT_COPIED = new Set(["native/memory.mjs", "native/memory.d.mts"]);
const SRC = path.resolve("src");

/** `rel` is a path under src/, with forward slashes. */
function shipsVerbatim(rel: string): boolean {
  if (!rel.endsWith(".mjs") && !rel.endsWith(".d.mts")) return false;
  if (NOT_COPIED.has(rel)) return false;
  return VERBATIM_DIRS.includes(path.posix.dirname(rel).replace(/^\.$/, ""));
}

// A TypeScript entry that imports a verbatim runtime module imports the shipped file
// instead of inlining a second copy of it into a chunk: one module instance per realm,
// and the package carries each runtime module once. The emitted specifier is relative
// to the chunk, which sits at the root of dist like the copies' own tree. tsdown takes
// patterns here, so this is the resolved path of exactly the .mjs files shipsVerbatim
// copies, on either separator.
const SEP = "[\\\\/]";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VERBATIM_RUNTIME_MODULE = new RegExp(
  `^${SRC.split(/[\\/]/).map(escapeRegExp).join(SEP)}${SEP}` +
    `(?!${[...NOT_COPIED].map((rel) => rel.split("/").map(escapeRegExp).join(SEP)).join("|")}$)` +
    `(?:(?:${VERBATIM_DIRS.filter(Boolean).map(escapeRegExp).join("|")})${SEP})?[^\\\\/]+\\.mjs$`,
);

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
      VERBATIM_RUNTIME_MODULE,
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

export default defineConfig([
  {
    ...shared,
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
      // runtime (native: via module.register; jest-compat: as setup file / alias
      // targets resolved by Vite), so they must ship verbatim rather than bundled.
      "build:done": () => {
        referenceVitest("matchers.d.mts");
        // Ship runtime .mjs verbatim, plus hand-written .d.mts type stubs for them.
        for (const sub of VERBATIM_DIRS) {
          const outDir = path.resolve("dist", sub);
          fs.mkdirSync(outDir, { recursive: true });
          for (const f of fs.readdirSync(path.join(SRC, sub))) {
            if (shipsVerbatim(path.posix.join(sub, f))) {
              fs.copyFileSync(path.join(SRC, sub, f), path.join(outDir, f));
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
