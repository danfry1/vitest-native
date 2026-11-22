/**
 * The fix IMPORT_META_IN_NODE_OWNED names for a package: `transform: { exclude: [pkg] }`
 * hands the package to Vite, where `import.meta.env` has its value. Run on the museum's
 * own-alias-import-meta shape (a React Native workspace library string-aliased to its
 * source), and on an installed package published as an ES module, which Vitest leaves to
 * Node unless it is also inlined. Each is materialised against this build.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { type Edit, runApp } from "./support/run-app";

const USES_ENV = [
  {
    file: "packages/feature/src/meta.ts",
    find: "export const metaUrlType: string = typeof import.meta.url;",
    replace: "export const metaUrlType: string = import.meta.env.MODE;",
  },
  { file: "meta.test.ts", find: 'toBe("string")', replace: 'toBe("test")' },
];
const EXCLUDE = {
  file: "vitest.config.mts",
  find: "reactNative({ hotRuntime: false })",
  replace: 'reactNative({ hotRuntime: false, transform: { exclude: ["@m/feature"] } })',
};

it("without it, Node loads the library and `import.meta.env` fails by name", () => {
  const { status, output } = runApp("own-alias-import-meta", { edits: USES_ENV });
  expect(status, output).not.toBe(0);
  expect(output).toMatch(/`import\.meta\.env` in \S*packages\/feature\/src\/meta\.ts:\d+:\d+/);
  expect(output).toContain("let Vite load '@m/feature'");
}, 150_000);

it("with `transform: { exclude: [pkg] }`, Vite loads it and `import.meta.env` works", () => {
  const { status, output } = runApp("own-alias-import-meta", { edits: [...USES_ENV, EXCLUDE] });
  expect(status, output).toBe(0);
}, 150_000);

const ESM_PACKAGE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/import-meta-esm-package",
);
const esmPackage = (edits: Edit[]) =>
  runApp("import-meta-esm-package", { from: ESM_PACKAGE, edits });
const EXCLUDE_ESM = {
  file: "vitest.config.mts",
  find: "reactNative({ hotRuntime: false })",
  replace: 'reactNative({ hotRuntime: false, transform: { exclude: ["vn-import-meta-esm"] } })',
};
const INLINE_ESM = {
  file: "vitest.config.mts",
  find: 'include: ["*.test.ts"],',
  replace: 'include: ["*.test.ts"], server: { deps: { inline: ["vn-import-meta-esm"] } },',
};

it("for a package published as an ES module, the fix names inlining it too", () => {
  const { status, output } = esmPackage([]);
  expect(status, output).not.toBe(0);
  expect(output).toContain("let Vite load 'vn-import-meta-esm'");
  expect(output).toContain("`test: { server: { deps: { inline: [...] } } }`");
}, 150_000);

it("excluded only, Node runs that package as published, without `import.meta.env`", () => {
  const { status, output } = esmPackage([EXCLUDE_ESM]);
  expect(status, output).not.toBe(0);
  expect(output).toContain("Cannot read properties of undefined (reading 'MODE')");
}, 150_000);

it("excluded and inlined, Vite loads it and `import.meta.env` works", () => {
  const { status, output } = esmPackage([EXCLUDE_ESM, INLINE_ESM]);
  expect(status, output).toBe(0);
}, 150_000);
