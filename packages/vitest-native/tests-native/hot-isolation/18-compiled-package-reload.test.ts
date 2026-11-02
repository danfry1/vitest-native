import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it, vi } from "vitest";

// A file of a package selected for compiling (`transform` in this suite's config) that
// is loaded again, as the hot runtime loads it again in every test file, is answered
// from its held compiled output (heldTransform in transform.mjs) and not read to decide
// again whether it needs compiling: once by the require hook, and once by the ESM
// loader when it arrives through `import`.
const req = createRequire(import.meta.url);
const file = fs.realpathSync(req.resolve("untranspiled-jsx-lib"));
const readsOf = (load: () => unknown) => {
  const read = vi.spyOn(fs, "readFileSync");
  try {
    const value = load();
    return { value, reads: read.mock.calls.filter(([f]) => String(f) === file).length };
  } finally {
    read.mockRestore();
  }
};

it("loads a compiled package's file again without reading it", () => {
  expect(req("untranspiled-jsx-lib")).toBeTypeOf("function");
  delete req.cache[file];
  const { value, reads } = readsOf(() => req("untranspiled-jsx-lib"));
  expect(value).toBeTypeOf("function");
  expect(reads).toBe(0);
});

it("imports a compiled package's file again without reading it", async () => {
  // Node's own import(), past Vite's module runner, so the engine's ESM loader serves
  // it. Each query is a new module to Node, as the hot runtime's generation stamp is.
  const nativeImport = req("./native-import.cjs") as (url: string) => Promise<{
    default: unknown;
  }>;
  const url = pathToFileURL(file).href;
  expect((await nativeImport(`${url}?vn-reload=1`)).default).toBeTypeOf("function");
  const read = vi.spyOn(fs, "readFileSync");
  let reads: number;
  try {
    expect((await nativeImport(`${url}?vn-reload=2`)).default).toBeTypeOf("function");
    reads = read.mock.calls.filter(([f]) => String(f) === file).length;
  } finally {
    read.mockRestore();
  }
  expect(reads).toBe(0);
});

// Fixture packages in a fresh temporary directory (under its real path, the spelling
// Node resolves to): one named like the package this suite compiles, so its files are
// compiled too, and one that publishes only TypeScript under node_modules, which the
// ESM loader compiles for any package.
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-compiled-reload-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const write = (rel: string, source: string) => {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
};

// ES module syntax, which Node cannot run as CommonJS, so the engine compiles it.
it("compiles a compiled package's file again after a same-size edit with a later mtime", () => {
  const edited = write("node_modules/untranspiled-jsx-lib/edited.js", 'export const edit = "a";\n');
  const load = () => {
    delete req.cache[edited];
    return (req(edited) as { edit: string }).edit;
  };
  expect(load()).toBe("a");
  const { mtime } = fs.statSync(edited);
  fs.writeFileSync(edited, 'export const edit = "b";\n');
  const later = new Date(mtime.getTime() + 5000);
  fs.utimesSync(edited, later, later);
  expect(load()).toBe("b");
});

it("imports a package's published TypeScript again without reading it", async () => {
  write("node_modules/ts-only-pkg/package.json", JSON.stringify({ name: "ts-only-pkg" }));
  const tsFile = write("node_modules/ts-only-pkg/index.ts", 'export const kind: string = "ts";\n');
  const nativeImport = req("./native-import.cjs") as (url: string) => Promise<{ kind: string }>;
  const url = pathToFileURL(tsFile).href;
  expect((await nativeImport(`${url}?vn-reload=1`)).kind).toBe("ts");
  const read = vi.spyOn(fs, "readFileSync");
  let reads: number;
  try {
    expect((await nativeImport(`${url}?vn-reload=2`)).kind).toBe("ts");
    reads = read.mock.calls.filter(([f]) => String(f) === tsFile).length;
  } finally {
    read.mockRestore();
  }
  expect(reads).toBe(0);
});

// An update that names only the source extensions, as resolution-memo.test.ts makes,
// keeps the rest of what the hooks were installed with.
const updateHooks = (next: object) =>
  (globalThis as { __vitest_native_require_hooks_update?: (n: object) => void })
    .__vitest_native_require_hooks_update!(next);
const sourceExts = JSON.parse(
  process.env.VITEST_NATIVE_SOURCE_EXTS ?? '["js","jsx","json","ts","tsx"]',
) as string[];

it("still compiles the selected package after an update of the source extensions alone", () => {
  updateHooks({ sourceExts });
  delete req.cache[file];
  expect(req("untranspiled-jsx-lib")).toBeTypeOf("function");
});

it("still loads a preset package's image from its file after an update of the source extensions alone", () => {
  // A package with a preset mock: a request for one of its subpaths is served from the
  // mock, except for its assets, which load from their real files.
  const holder = globalThis as { __vitest_native_preset_mocks?: Record<string, unknown> };
  const hadMocks = holder.__vitest_native_preset_mocks !== undefined;
  const mocks = (holder.__vitest_native_preset_mocks ??= {});
  write("node_modules/preset-asset-pkg/package.json", JSON.stringify({ name: "preset-asset-pkg" }));
  write("node_modules/preset-asset-pkg/logo.png", "");
  mocks["preset-asset-pkg"] = { Mocked: true };
  try {
    updateHooks({ sourceExts });
    const fromOutside = createRequire(write("app/index.js", ""));
    expect(fromOutside("preset-asset-pkg/logo.png")).toBeTypeOf("number");
  } finally {
    delete mocks["preset-asset-pkg"];
    if (!hadMocks) delete holder.__vitest_native_preset_mocks;
  }
});
