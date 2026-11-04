// @vitest/coverage-v8, for a project whose tests run part of its own source in Node.
//
// The plugin installs this module as Vitest's coverage provider when the configured one
// is 'v8' (useNativeCoverageProvider in plugin.ts). The test workers run
// @vitest/coverage-v8's own runtime, unchanged: they ask V8 for its counts and write
// them out. The difference is in the main process, where those counts become a report.
//
// What V8 counted for a file is a list of offsets into the code it ran. For a file Vite
// loads, @vitest/coverage-v8 transforms the file through Vite again and maps the offsets
// back through that output's source map. For a file Node compiled (transform.mjs) the
// code that ran is Babel's output, which Vite never produces: the plugin refuses to
// transform a file Node owns, the provider fell back to parsing the original
// TypeScript, Flow or JSX as JavaScript, failed, and left the file out of the report
// ("Failed to parse … Excluding it from coverage."). Two steps answer that here:
//
// - transformFile: for a file Node owns, the code Node ran, with its source map.
//   Babel's output is reproduced from the project's transform cache (keyed by the
//   file's content, so it is the output the worker compiled) and carries the map
//   inline (transform.mjs, "Source maps for the source a project owns"). A file Node
//   ran as published is its own text, with no map.
//
// - convertCoverage: what V8 reported under a Node-owned file's URL that is not that
//   code. An ES module import of a file Node compiles is served by a facade (loader.mjs,
//   requireFacade) under the file's own URL, carrying the compiled code inside a
//   function it never calls, so V8 reports two scripts for the one file and the main
//   process merges them. ast-v8-to-istanbul reads the narrowest range at each offset,
//   and the facade's ranges are all wider than the module's, so today the facade
//   changes no count; it is dropped so that the report does not rest on that. The
//   module Node compiled is the script whose top-level function spans exactly the
//   compiled code. If none does, the file changed between the run and the report, and
//   it is left out with a warning rather than mapped onto the wrong code. A URL the hot
//   runtime stamped (`?vnhot=N`, loader.mjs) is read as the file's own: Node runs
//   compiled code only under the file's path, so a stamped script of a compiled file
//   can only be a facade, and is dropped.
//
// @vitest/coverage-v8 is the one Vitest itself would load: resolved from the running
// Vitest, which is how Vitest imports its built-in providers.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VitestNativeError } from "../errors.mjs";

let runtime = null;

/** @vitest/coverage-v8's module, as Vitest would import it. */
function coverageV8() {
  runtime ??= (async () => {
    const fromHere = createRequire(import.meta.url);
    const fromVitest = createRequire(fromHere.resolve("vitest/package.json"));
    let entry;
    try {
      entry = fromVitest.resolve("@vitest/coverage-v8");
    } catch (cause) {
      throw new VitestNativeError(
        "UNSUPPORTED_PEER",
        "coverage with provider 'v8' needs @vitest/coverage-v8, installed at the same " +
          "version as vitest.",
        { cause },
      );
    }
    return (await import(pathToFileURL(entry).href)).default;
  })();
  return runtime;
}

// The worker's side, unchanged: each call is @vitest/coverage-v8's own, on its module.
export default {
  async startCoverage(options) {
    return (await coverageV8()).startCoverage(options);
  },
  async takeCoverage(options) {
    return (await coverageV8()).takeCoverage(options);
  },
  async stopCoverage(options) {
    return (await coverageV8()).stopCoverage(options);
  },
  async getProvider() {
    const base = await (await coverageV8()).getProvider();
    const { transformRN, needsTransform } = await import("./transform.mjs");
    return nodeAwareProvider(base, { transformRN, needsTransform });
  },
};

const INLINE_MAP =
  /\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\s*$/;
const COMPILED_EXTENSION = /\.(?:[cm]?tsx?|mjs|jsx)$/;

/** A coverage URL or path (`file:///…?vnhot=3`, `/…`, `C:/…`) as a file path. */
export function coverageFile(url) {
  if (url.startsWith("file://")) return fileURLToPath(url.replace(/[?#].*$/, ""));
  return path.resolve(url.replace(/[?#].*$/, ""));
}

/** The vitest-native plugin's API on a Vitest project, if the project has the plugin. */
function nativeApi(project) {
  const plugins = project?.vite?.config?.plugins ?? [];
  return plugins.find((plugin) => plugin?.name === "vitest-native")?.api ?? null;
}

/**
 * What Node ran for `file` in `project`: `{ compiled, code, map }`, or null when Vite
 * loads the file (or the project does not use the native engine).
 */
export function nodeSource(file, project, toolchain) {
  const target = nativeApi(project)?.nodeCoverageTarget?.(file);
  if (!target) return null;
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  // As the require hook and the loader decide (hooks.mjs, loader.mjs): TypeScript, JSX
  // and ES modules are always compiled, and anything else only when V8 cannot parse it.
  if (!COMPILED_EXTENSION.test(file) && !toolchain.needsTransform(file, src)) {
    return { compiled: false, code: src, map: null };
  }
  const code = toolchain.transformRN(file, src, target.root, target.platform);
  const inline = INLINE_MAP.exec(code);
  const map = inline ? JSON.parse(Buffer.from(inline[1], "base64").toString("utf8")) : null;
  // `sources` as file URLs, so the report names the original file wherever the map
  // was written from.
  if (map) map.sources = [pathToFileURL(file).href];
  return { compiled: true, code, map };
}

/**
 * The scripts V8 reported, with what is not the compiled module removed from a
 * Node-compiled file's entries (see the header) and stamped URLs of files Node ran as
 * published returned to the file's own URL.
 */
export function nodeScripts(scripts, sourceOf, warn) {
  const out = [];
  for (const script of scripts) {
    let file;
    try {
      file = coverageFile(script.url);
    } catch {
      out.push(script);
      continue;
    }
    const source = sourceOf(file);
    if (source === null) {
      out.push(script);
      continue;
    }
    const stamped = /[?#]/.test(script.url);
    const url = stamped ? pathToFileURL(file).href : script.url;
    // A file Node ran as published, or an `.mjs` the loader serves compiled at its own
    // URL: the script is the module.
    if (!source.compiled || file.endsWith(".mjs")) {
      out.push(stamped ? { ...script, url } : script);
      continue;
    }
    // Compiled code runs only under the file's plain path (Node's CommonJS loader); a
    // stamped URL is the hot runtime's facade.
    if (stamped) continue;
    const length = source.code.length;
    const isOtherRoot = (fn) =>
      fn.ranges[0]?.startOffset === 0 && fn.ranges[0].endOffset !== length;
    const functions = script.functions.filter((fn) => !isOtherRoot(fn));
    if (!functions.some((fn) => fn.ranges[0]?.startOffset === 0)) {
      warn(
        `[vitest-native] coverage: ${file} changed after the tests ran it (or ran with ` +
          `another Babel configuration), so its counts cannot be mapped to its source. ` +
          `It is left out of this report.`,
      );
      continue;
    }
    out.push({ ...script, functions });
  }
  return out;
}

function nodeAwareProvider(base, toolchain) {
  const Base = Object.getPrototypeOf(base).constructor;
  // @vitest/coverage-v8 4.1 and 5 both convert through these two methods. A version
  // without them gets the provider as published.
  if (
    typeof Base.prototype.convertCoverage !== "function" ||
    typeof Base.prototype.transformFile !== "function"
  ) {
    return base;
  }
  class NativeV8CoverageProvider extends Base {
    #sources = new Map();
    #warned = new Set();

    #sourceOf(file, project) {
      const key = `${project?.name ?? ""}\0${file}`;
      let source = this.#sources.get(key);
      if (source === undefined) {
        source = nodeSource(file, project, toolchain);
        this.#sources.set(key, source);
      }
      return source;
    }

    async convertCoverage(coverage, project = this.ctx.getRootProject(), environment) {
      const result = nodeScripts(
        coverage.result,
        (file) => this.#sourceOf(file, project),
        (message) => {
          if (this.#warned.has(message)) return;
          this.#warned.add(message);
          this.ctx.logger.warn(message);
        },
      );
      return super.convertCoverage({ ...coverage, result }, project, environment);
    }

    async transformFile(url, project, ...rest) {
      const source = this.#sourceOf(coverageFile(url), project);
      if (source !== null) return { code: source.code, map: source.map };
      return super.transformFile(url, project, ...rest);
    }
  }
  return new NativeV8CoverageProvider();
}
