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
// @vitest/coverage-v8 is resolved beside the `vitest` this package resolves (its peer,
// which a package manager links to the project's own), as Vitest imports its built-in
// providers from its own location. @vitest/coverage-v8 warns by itself when its version
// and the running Vitest's differ.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VitestNativeError } from "../errors.mjs";

let runtime = null;

/** @vitest/coverage-v8's module, resolved beside `vitest`. */
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
    const { transformRN, needsTransform, enableSourceMaps } = await import("./transform.mjs");
    // The test workers compile project source with a source map while coverage is on
    // (the project context's `sourceMaps`); this process compiles it again, for the
    // report, the same way.
    enableSourceMaps();
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
 * What Node ran for `file` in `project`: `{ compiled, code, map }`; `{ unmappable }`, a
 * reason, when Node compiled it but its compiled code cannot be mapped here; or null
 * when Vite loads the file (or the project does not use the native engine).
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
  let code;
  try {
    code = toolchain.transformRN(file, src, target.root, target.platform);
  } catch (err) {
    return { unmappable: `compiling it for the report failed: ${err?.message ?? err}` };
  }
  const inline = INLINE_MAP.exec(code);
  // No map: the tests ran without one, as when coverage was turned on in a watch session
  // after they started. Counts read without it would land on the compiled code's lines.
  if (!inline) return { unmappable: "the tests compiled it without a source map" };
  const map = JSON.parse(Buffer.from(inline[1], "base64").toString("utf8"));
  // `sources` as file URLs, resolved as the map itself would resolve them: Babel names
  // the file it compiled, or, for a file that carries a map of its own (a built library
  // with its `.js.map`), the sources that map names.
  const base = new URL(map.sourceRoot ?? "", pathToFileURL(file));
  map.sources = (map.sources ?? []).map((source) => new URL(source, base).href);
  delete map.sourceRoot;
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
    if (source.unmappable) {
      warn(unmappableMessage(file, source.unmappable));
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
    // The facade is the compiled code plus its own lines around it, so its top-level
    // function always reaches past the code's end. A function of the module that starts
    // at offset 0 (compiled output can begin with a declaration) never does.
    const length = source.code.length;
    const isFacade = (fn) => fn.ranges[0]?.startOffset === 0 && fn.ranges[0].endOffset > length;
    const functions = script.functions.filter((fn) => !isFacade(fn));
    if (
      !functions.some((fn) => fn.ranges[0]?.startOffset === 0 && fn.ranges[0].endOffset === length)
    ) {
      warn(
        unmappableMessage(
          file,
          "it changed after the tests ran it, or they compiled it with other Babel settings",
        ),
      );
      continue;
    }
    out.push({ ...script, functions });
  }
  return out;
}

function unmappableMessage(file, reason) {
  return (
    `[vitest-native] coverage: ${file} is left out of this report: ${reason}, so its ` +
    `counts cannot be mapped to its source.`
  );
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
    // Per file as it is on disk now: a watch session keeps this provider across reruns,
    // and an edited file must be read again (transformRN's own memo is keyed the same).
    #sources = new Map();
    #warned = new Set();

    #sourceOf(file, project) {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        return null;
      }
      const key = `${project?.name ?? ""}\0${file}\0${stat.mtimeMs}\0${stat.size}`;
      let source = this.#sources.get(key);
      if (source === undefined) {
        source = nodeSource(file, project, toolchain);
        this.#sources.set(key, source);
      }
      return source;
    }

    #warn(message) {
      if (this.#warned.has(message)) return;
      this.#warned.add(message);
      this.ctx.logger.warn(message);
    }

    async generateCoverage(...args) {
      // Once per report: a rerun that still cannot map a file says so again.
      this.#warned.clear();
      return super.generateCoverage(...args);
    }

    async convertCoverage(coverage, project = this.ctx.getRootProject(), environment) {
      const result = nodeScripts(
        coverage.result,
        // A file the report leaves out anyway (`include`, `exclude`, outside the root) is
        // not compiled for it.
        (file) => (this.isIncluded(file) ? this.#sourceOf(file, project) : null),
        (message) => this.#warn(message),
      );
      return super.convertCoverage({ ...coverage, result }, project, environment);
    }

    async transformFile(url, project, ...rest) {
      const file = coverageFile(url);
      const source = this.#sourceOf(file, project);
      if (source?.unmappable) {
        // Reached for a file no test ran (`coverage.include`): it is reported as empty
        // rather than parsed as JavaScript.
        this.#warn(unmappableMessage(file, source.unmappable));
        return { code: "", map: null };
      }
      if (source !== null) return { code: source.code, map: source.map };
      return super.transformFile(url, project, ...rest);
    }
  }
  return new NativeV8CoverageProvider();
}
