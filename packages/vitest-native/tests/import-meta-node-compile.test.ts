/**
 * `import.meta` in a file Node loads compiled to CommonJS: a React Native workspace
 * member reached through an alias, an ES module package selected for compiling, app
 * source a `require()` reaches. CommonJS has no `import.meta`, so the compiled file
 * failed as "Cannot use 'import.meta' outside a module", which is also what Jest gives
 * with babel-jest alone. `url`, `filename` and `dirname` get their CommonJS values, as
 * babel-plugin-transform-import-meta gives them under Jest; any other property fails by
 * name (IMPORT_META_IN_NODE_OWNED). See importMetaToCommonJS in
 * src/native/babel-toolchain.mjs.
 *
 * The compiled output is EXECUTED through Node's own CommonJS wrapper, because what
 * matters is the value the module sees, and the wrapper is where `require`,
 * `__filename` and `__dirname` come from.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { transformRN, transformCacheDir } from "../src/native/transform.mjs";
// @ts-expect-error — runtime .mjs, no types
import {
  handleToolchainRequest,
  mentionsImportMeta,
  importMetaToCommonJS,
} from "../src/native/babel-toolchain.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let dir: string;

function write(rel: string, contents: string): string {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

/** Compile `file` as the engine's require hook does, and run it as Node runs CommonJS. */
function load(file: string): Record<string, unknown> {
  const code = transformRN(file, fs.readFileSync(file, "utf8"), projectRoot);
  const mod = new Module(file) as Module & { _compile(code: string, file: string): void };
  mod.filename = file;
  // Compiled output may require @babel/runtime helpers, which resolve from the project.
  (mod as unknown as { paths: string[] }).paths = (
    Module as unknown as { _nodeModulePaths(dir: string): string[] }
  )._nodeModulePaths(projectRoot);
  mod._compile(code, file);
  return mod.exports as Record<string, unknown>;
}

/** The error compiling `file` throws. */
function failure(file: string): Error & { code?: string } {
  try {
    transformRN(file, fs.readFileSync(file, "utf8"), projectRoot);
  } catch (err) {
    return err as Error & { code?: string };
  }
  throw new Error(`compiling ${file} did not throw`);
}

beforeAll(() => {
  // Outside the project root, so the preset compiles it as it compiles a package.
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-import-meta-")));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the properties CommonJS has a value for", () => {
  it("import.meta.url is the file's URL", () => {
    const file = write("url/meta.ts", "export const url: string = import.meta.url;\n");
    expect(load(file).url).toBe(pathToFileURL(file).href);
  });

  it("import.meta.filename is the file's path", () => {
    const file = write("filename/meta.ts", "export const filename = import.meta.filename;\n");
    expect(load(file).filename).toBe(file);
  });

  it("import.meta.dirname is the file's directory", () => {
    const file = write("dirname/meta.ts", "export const dirname = import.meta.dirname;\n");
    expect(load(file).dirname).toBe(path.dirname(file));
  });

  it("in an ES module goal file, optional and computed members included", () => {
    write("esm/package.json", '{ "type": "module" }');
    const file = write(
      "esm/meta.js",
      [
        "export const optional = import.meta?.url;",
        'export const computed = import.meta["dirname"];',
        "export const kind = typeof import.meta.filename;",
        "",
      ].join("\n"),
    );
    expect(load(file)).toMatchObject({
      optional: pathToFileURL(file).href,
      computed: path.dirname(file),
      kind: "string",
    });
  });

  it("whatever a nested scope names `require`, `__filename` or `__dirname`", () => {
    // ES module source is free to use these names; the values still come from the
    // module wrapper, as import.meta's would.
    const file = write(
      "shadowed/meta.ts",
      [
        "export function read(require: unknown, __filename: string, __dirname: string) {",
        "  return [import.meta.url, import.meta.filename, import.meta.dirname];",
        "}",
        "",
      ].join("\n"),
    );
    const { read } = load(file) as { read: (...args: unknown[]) => string[] };
    expect(read(null, "shadow", "shadow")).toEqual([
      pathToFileURL(file).href,
      file,
      path.dirname(file),
    ]);
  });

  it("the ESM idiom `createRequire(import.meta.url)` resolves beside the file", () => {
    write("idiom/sibling.cjs", "module.exports = 'sibling';\n");
    const file = write(
      "idiom/meta.js",
      [
        "import { createRequire } from 'node:module';",
        "const load = createRequire(import.meta.url);",
        "export const sibling = load('./sibling.cjs');",
        "",
      ].join("\n"),
    );
    write("idiom/package.json", '{ "type": "module" }');
    expect(load(file).sibling).toBe("sibling");
  });
});

describe("the ES module idioms that rebuild CommonJS's names", () => {
  it("`const require = createRequire(import.meta.url)` and `__dirname` from the URL", () => {
    write("idioms/package.json", '{ "type": "module" }');
    write("idioms/dep.cjs", "module.exports = 'dep';\n");
    const file = write(
      "idioms/meta.js",
      [
        "import { createRequire } from 'node:module';",
        "import { fileURLToPath } from 'node:url';",
        "import path from 'node:path';",
        "const require = createRequire(import.meta.url);",
        "const __filename = fileURLToPath(import.meta.url);",
        "const __dirname = path.dirname(__filename);",
        "export const dep = require('./dep.cjs');",
        "export { __filename as file, __dirname as dir };",
        "",
      ].join("\n"),
    );
    expect(load(file)).toMatchObject({ dep: "dep", file, dir: path.dirname(file) });
  });
});

describe("the pre-check", () => {
  it("is linear in the source, whatever the comments", () => {
    // Shapes that made a comment-aware pattern rescan the rest of the file per `import`.
    const shapes = [
      "import /* c */ x from 'y'; /* doc */\n".repeat(20_000),
      "import/*".repeat(50_000),
      "import //\n".repeat(50_000),
    ];
    for (const src of shapes) {
      const start = performance.now();
      mentionsImportMeta(src);
      expect(performance.now() - start).toBeLessThan(100);
    }
  });

  it("sees `import.meta` with whitespace or comments between its tokens", () => {
    for (const src of [
      "import.meta",
      "import . meta",
      "import /* a */ . /* b */ meta",
      "import //\n.meta",
    ]) {
      expect(mentionsImportMeta(src), src).toBe(true);
    }
    expect(mentionsImportMeta("import x from 'metadata';")).toBe(false);
  });
});

describe("any other property fails by name", () => {
  it.each([
    ["env", "export const mode = import.meta.env.MODE;\n", "`import.meta.env`", "1:21"],
    ["hot", "if (import.meta.hot) import.meta.hot.accept();\n", "`import.meta.hot`", "1:5"],
    ["glob", "export const all = import.meta.glob('./*.ts');\n", "`import.meta.glob`", "1:20"],
    ["bare", "export const meta = import.meta;\n", "`import.meta`", "1:21"],
  ])("%s", (name, source, what, at) => {
    write(`fails-${name}/package.json`, JSON.stringify({ name: `@m/fails-${name}` }));
    const file = write(`fails-${name}/src/meta.ts`, source);
    const err = failure(file);
    expect(err.name).toBe("VitestNativeError");
    expect(err.code).toBe("IMPORT_META_IN_NODE_OWNED");
    expect(err.message).toMatch(/^\[vitest-native\] /);
    // The property, the file and where in it, and the fix: the owning package, named
    // for `transform.exclude`, which hands the package to Vite.
    // Shown with forward slashes on every platform.
    const shown = file.split(path.sep).join("/");
    expect(err.message).toContain(`${what} in ${shown}:${at} has no value here`);
    expect(err.message).toContain(`let Vite load '@m/fails-${name}'`);
    expect(err.message).toContain("`transform: { exclude: [...] }`");
    // Babel's own prefix and the generic "could not parse" hint are not repeated.
    expect(err.message).not.toContain("could not parse");
    expect(err.message.match(/\[vitest-native\]/g)).toHaveLength(1);
  });

  it("names the project's own source, which a require reached, with its own fix", () => {
    // A file of the project root's own package: transform.exclude does not apply. The
    // root is spelled as given (on macOS the temporary directory is a symlink), the file
    // by its real path, as Node reports it.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-import-meta-app-"));
    try {
      fs.writeFileSync(path.join(root, "package.json"), '{ "name": "app" }');
      fs.mkdirSync(path.join(root, "src"));
      fs.writeFileSync(path.join(root, "src", "package.json"), '{ "type": "module" }');
      const file = path.join(fs.realpathSync(root), "src", "env.ts");
      fs.writeFileSync(file, "export const mode = import.meta.env.MODE;\n");
      let message = "did not throw";
      try {
        presetRequire("@babel/core").transformSync(
          fs.readFileSync(file, "utf8"),
          babelOptions(file, [importMetaToCommonJS(root)]),
        );
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(
        /`import\.meta\.env` in (?:\S*\/)?src\/env\.ts:1:21 has no value here/,
      );
      expect(message).toContain("import the file from the test so Vite loads it");
      expect(message).not.toContain("transform: { exclude");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a vitest-native error class wherever Babel runs", () => {
    // On this thread (the registry compiler's process) the error is the class itself.
    const file = write("same-thread/meta.ts", "export const mode = import.meta.env.MODE;\n");
    let err: (Error & { code?: string }) | undefined;
    try {
      handleToolchainRequest({
        kind: "transform",
        root: projectRoot,
        src: fs.readFileSync(file, "utf8"),
        importMeta: true,
        options: babelOptions(file),
      });
    } catch (e) {
      err = e as Error & { code?: string };
    }
    expect(err?.name).toBe("VitestNativeError");
    expect(err?.code).toBe("IMPORT_META_IN_NODE_OWNED");
  });
});

const presetRequire = createRequire(path.join(projectRoot, "package.json"));
function babelOptions(file: string, plugins: unknown[] = []) {
  return {
    filename: file,
    plugins,
    presets: [presetRequire.resolve("@react-native/babel-preset")],
    babelrc: false,
    configFile: false,
    caller: { name: "metro", bundler: "metro", platform: "ios", supportsStaticESM: false },
  };
}

describe("what is left alone", () => {
  it("a mention in a comment or a string is not `import.meta`", () => {
    const file = write(
      "mention/meta.ts",
      [
        "// import.meta.env is Vite's",
        'export const text = "import.meta.hot";',
        "/* import . meta */",
        "",
      ].join("\n"),
    );
    expect(mentionsImportMeta(fs.readFileSync(file, "utf8"))).toBe(true);
    expect(load(file).text).toBe("import.meta.hot");
  });

  it("a plugin of the project's that lowers `import.meta` keeps its answer", () => {
    // babel-preset-expo replaces it with its registry; babel-jest under Jest gives that
    // value, so the engine's lowering only takes what is still there afterwards.
    const file = path.join(dir, "own-plugin", "meta.ts");
    const own = ({ types: t }: { types: typeof import("@babel/types") }) => ({
      visitor: {
        MetaProperty(p: { replaceWith(node: unknown): void }) {
          p.replaceWith(t.identifier("projectsOwnImportMeta"));
        },
      },
    });
    const { code } = handleToolchainRequest({
      kind: "transform",
      root: projectRoot,
      src: "export const env = import.meta.env;\n",
      importMeta: true,
      options: babelOptions(file, [own]),
    });
    expect(code).toContain("projectsOwnImportMeta.env");
    expect(code).not.toContain("importMeta_");
  });

  it("under babel-preset-expo, Expo's own rewrite stands, as under jest-expo", () => {
    // babel-preset-expo replaces `import.meta` with the registry Expo's runtime installs;
    // jest-expo compiles with the same Metro caller, so this is the value Jest gives.
    // Resolved through `expo`, whose dependency it is. Compiled in a child process: in
    // this one, the test setup's resolver patches would load Expo's preset.
    const expoPreset = createRequire(presetRequire.resolve("expo/package.json")).resolve(
      "babel-preset-expo",
    );
    const request = {
      kind: "transform",
      root: projectRoot,
      src: "export const url = import.meta.url;\nexport const mode = import.meta.env.MODE;\n",
      importMeta: true,
      options: { ...babelOptions(path.join(dir, "expo", "meta.ts")), presets: [expoPreset] },
    };
    const toolchain = pathToFileURL(path.join(projectRoot, "src/native/babel-toolchain.mjs")).href;
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { handleToolchainRequest } = await import(${JSON.stringify(toolchain)});` +
          `process.stdout.write(handleToolchainRequest(${JSON.stringify(request)}).code);`,
      ],
      { encoding: "utf8" },
    );
    expect(child.status, child.stderr).toBe(0);
    const code = child.stdout;
    expect(code).toContain("globalThis.__ExpoImportMetaRegistry.url");
    expect(code).toContain("globalThis.__ExpoImportMetaRegistry.env.MODE");
    expect(code).not.toContain("importMeta_");
  });

  it("a file without `import.meta` compiles as before, under its previous cache key", () => {
    const src = "export const plain = 1;\n";
    const file = write("plain/plain.ts", src);
    const out = transformRN(file, src, projectRoot);
    expect(out).not.toContain("importMeta_");
    // The key is unchanged, so every entry and the precompiled registry stay warm.
    const key = crypto
      .createHash("sha1")
      .update("ios")
      .update("\0")
      .update(file)
      .update("\0")
      .update(src)
      .digest("hex");
    expect(fs.readFileSync(path.join(transformCacheDir(projectRoot), `${key}.js`), "utf8")).toBe(
      out,
    );
  });

  it("a file with `import.meta` is not served output cached before the lowering", () => {
    const src = "export const url = import.meta.url;\n";
    const file = write("stale/meta.ts", src);
    const previousKey = crypto
      .createHash("sha1")
      .update("ios")
      .update("\0")
      .update(file)
      .update("\0")
      .update(src)
      .digest("hex");
    const stale = path.join(transformCacheDir(projectRoot) ?? "", `${previousKey}.js`);
    fs.writeFileSync(stale, "exports.url = import.meta.url;\n");
    try {
      expect(load(file).url).toBe(pathToFileURL(file).href);
    } finally {
      fs.rmSync(stale, { force: true });
    }
  });
});
