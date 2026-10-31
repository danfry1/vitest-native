/**
 * A global the tests install must not reach Babel, whatever the state of the cache.
 *
 * Expo's runtime, installed at setup as jest-expo does, replaces `TextDecoder` with a
 * getter that requires expo/src/winter/TextDecoder.ts, and the engine's require hook
 * compiles that file. Babel loads part of itself during its first transform, and
 * @jridgewell/sourcemap-codec reads `TextDecoder` while it loads. When the cache was
 * warm, Babel first loaded at the first miss, after the getter was installed: the
 * getter ran inside Babel's own loading, the file it required was compiled by a Babel
 * still loading, and the run failed with "Cannot read properties of undefined
 * (reading 'environmentVisitor')" (see "Where Babel runs" in transform.mjs).
 *
 * Each case is its own Node process, so whether Babel has loaded is decided here, not
 * by whatever ran earlier on the test thread: one process warms the cache, the next is
 * served from it, installs the getter, then misses the cache once. Each process loads
 * Babel, so the cases get a generous timeout.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transformUrl = pathToFileURL(path.join(projectRoot, "src", "native", "transform.mjs")).href;
const scratch = path.join(projectRoot, "node_modules", ".cache");
fs.mkdirSync(scratch, { recursive: true });
// Under node_modules, as Expo's file is: compiled with the React Native preset, no
// project configuration involved.
const dir = fs.mkdtempSync(path.join(scratch, "vn-test-globals-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A TypeScript file Node cannot run as published, with content no cache has seen. */
function freshTs(name: string, body: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `// ${crypto.randomUUID()}\n${body}`);
  return file;
}

// Expo's installGlobal (expo/src/winter/installGlobal.ts, SDK 57): a lazy property
// whose first read runs `get` once and replaces itself with the value. Here `get`
// compiles `file` as the engine's require hook compiles Expo's TextDecoder.ts.
const installLazyGlobal = `
  globalThis.getterRuns = 0;
  function installLazyGlobal(name, file) {
    const real = globalThis[name];
    let value;
    let valueSet = false;
    const setValue = (v) => {
      value = v;
      valueSet = true;
      Object.defineProperty(globalThis, name, { value: v, configurable: true, writable: true, enumerable: true });
    };
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      set: setValue,
      get() {
        if (!valueSet) {
          valueSet = true;
          globalThis.getterRuns++;
          globalThis.compiled = transformRN(file);
          setValue(real);
        }
        return value;
      },
    });
  }
`;

function run(script: string): Record<string, unknown> {
  const prelude =
    `import { transformRN as compile } from ${JSON.stringify(transformUrl)};\n` +
    `const transformRN = (file) => compile(file, undefined, ${JSON.stringify(projectRoot)});\n` +
    installLazyGlobal;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `${prelude}\n${script}`],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
      // A child that never exits fails the case instead of hanging the run.
      timeout: 50_000,
    },
  );
  const line = out.split("\n").find((l) => l.startsWith("RESULT="));
  if (!line) throw new Error(`no result from the child process:\n${out}`);
  return JSON.parse(line.slice("RESULT=".length));
}

describe("a lazy global installed before Babel first loads", () => {
  it("compiles the cache miss, and the file the getter requires, on a warm cache", () => {
    const warm = freshTs("Warm.ts", "export const warm: number = 1;\n");
    // What expo/src/winter/TextDecoder.ts is: a class, compiled the first time the
    // getter runs, so never cached on a run whose Babel loaded before the getter existed.
    const lazy = freshTs(
      "TextDecoder.ts",
      "export class TextDecoder { encoding: string = 'utf-8'; }\n",
    );
    const miss = freshTs("Image.ts", "export class Image { private x: number = 1; }\n");

    // A run that fills the cache.
    expect(run(`transformRN(${JSON.stringify(warm)}); console.log("RESULT={}");`)).toEqual({});

    const result = run(`
      import Module from "node:module";
      const babelLoaded = () =>
        Object.keys(Module._cache).some((p) => /[\\\\/]@babel[\\\\/]core[\\\\/]lib[\\\\/]/.test(p));
      // Served from the cache: nothing has loaded Babel yet.
      transformRN(${JSON.stringify(warm)});
      const babelBeforeMiss = babelLoaded();
      installLazyGlobal("TextDecoder", ${JSON.stringify(lazy)});
      let error = null;
      let code = "";
      try {
        code = transformRN(${JSON.stringify(miss)});
      } catch (err) {
        error = String(err?.message ?? err);
      }
      console.log("RESULT=" + JSON.stringify({
        babelBeforeMiss,
        error,
        getterRuns: globalThis.getterRuns,
        compiled: code.includes("Image") && !code.includes("private x"),
      }));
    `);

    expect(result.babelBeforeMiss, "the cache hit loaded Babel").toBe(false);
    expect(result.error, "the cache miss after the getter was installed").toBeNull();
    expect(result.compiled).toBe(true);
    // Compiling never reads the tests' globals, so it never runs their getters.
    expect(result.getterRuns).toBe(0);
  }, 60_000);

  it("compiles the file the getter requires when a test reads the global", () => {
    const lazy = freshTs(
      "TextDecoder2.ts",
      "export class TextDecoder { encoding: string = 'utf-8'; }\n",
    );
    const result = run(`
      installLazyGlobal("TextDecoder", ${JSON.stringify(lazy)});
      const value = globalThis.TextDecoder;
      console.log("RESULT=" + JSON.stringify({
        getterRuns: globalThis.getterRuns,
        restored: typeof value === "function",
        compiled: globalThis.compiled.includes("TextDecoder") && !globalThis.compiled.includes(": string"),
      }));
    `);
    expect(result).toEqual({ getterRuns: 1, restored: true, compiled: true });
  }, 60_000);
});
