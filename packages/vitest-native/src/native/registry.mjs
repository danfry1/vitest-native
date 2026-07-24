// Precompiled React Native module registry.
//
// The native engine runs RN's real JS, and with isolation on (the default) that
// graph is re-instantiated for every test FILE: ~440 separate Node module loads,
// each paying a filesystem stat, a module-wrapper construction, and a compile-cache
// lookup. Measured on RN 0.86, that is ~59ms for a typical test's slice of RN and
// ~110ms for the full public surface — per file.
//
// This module collapses that into ONE file. At config time we walk RN's require
// graph once, apply exactly the transforms the per-file hooks would apply (native
// boundary source, Flow strip via the project's Babel preset, asset stubs), resolve
// every require target statically, and emit a single CJS file of lazy per-module
// factories keyed by real path. A test file then pays one read and one compile.
//
// What is deliberately preserved, because tests depend on all of it:
//   - laziness      — factories run on first require, so a test that touches View
//                     and StyleSheet still does not execute the rest of RN;
//   - module identity — one instance per path per worker, so RN's singletons
//                     (DeviceEventEmitter, Dimensions, Appearance) behave as they do
//                     today, and a deep `react-native/Libraries/...` require from an
//                     ecosystem package resolves to the same instance the app sees;
//   - isolation     — the registry is re-required per test file like any other
//                     module, so nothing leaks between files.
//
// The registry is an optimization, never a semantic: anything it cannot serve falls
// through to the per-file hooks in hooks.mjs / loader.mjs, and a failed build leaves
// the engine running exactly as it did before.
import Module from "node:module";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { transformRN, isFlow, cacheRootFor } from "./transform.mjs";
import { boundarySourceFor, BOUNDARY_SOURCES } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";

const RN_PATH = /[\\/]node_modules[\\/](react-native|@react-native)[\\/]/;
// Bump when the emitted registry's shape or the walk's semantics change, so a
// stale on-disk registry from an older vitest-native can never be reused.
const REGISTRY_FORMAT_VERSION = 1;

/**
 * Literal `require('…')` / `require("…")` calls. The leading class excludes
 * property access (`foo.require(...)`) and identifiers ending in "require"
 * (`__webpack_require__(...)`), which are not Node requires.
 *
 * Computed requires (`require(someVar)`) are invisible to this scan by design:
 * they resolve at runtime and fall through to the per-file hooks, which is why
 * the hooks must stay installed alongside the registry.
 */
const REQUIRE_RE = /(?:^|[^.\w$])require\(\s*(['"])([^'"]+)\1\s*\)/g;

/** Extensions Node handles natively and that must not be inlined as JS. */
const PASSTHROUGH_EXT = new Set([".json", ".node", ".wasm"]);

/**
 * Source for one file, applying the same precedence the per-file hooks use:
 * asset stub → native-boundary mock → Flow-stripped RN → verbatim.
 */
function sourceFor(file, { projectRoot, platform, reactNativeVersion, assetExtSet }) {
  const norm = file.replace(/\\/g, "/");
  const ext = path.extname(norm).slice(1).toLowerCase();
  if (ext && assetExtSet.has(ext)) {
    const basename = norm.split("/").pop() || norm;
    return { code: `module.exports = ${JSON.stringify(basename)};`, scan: false };
  }
  const boundary = boundarySourceFor(norm, platform, reactNativeVersion);
  if (boundary != null) return { code: boundary, scan: true };
  const src = fs.readFileSync(file, "utf8");
  if (norm.endsWith(".js") && isFlow(src)) {
    return { code: transformRN(file, src, projectRoot, platform), scan: true };
  }
  return { code: src, scan: true };
}

/**
 * Resolve one require target from a file, applying the platform-extension
 * resolution the hooks apply inside node_modules (`./Foo` → `Foo.ios.js`).
 * Returns an absolute path, or null when the target cannot be resolved.
 */
function resolveTarget(request, fromFile, platform) {
  if (request.startsWith(".") && !path.extname(request)) {
    const hit = resolvePlatformFile(path.resolve(path.dirname(fromFile), request), platform);
    if (hit) return hit;
  }
  try {
    return createRequire(fromFile).resolve(request);
  } catch {
    return null;
  }
}

/** This package's own version — part of the cache key (see registryKey). */
function ownVersion() {
  try {
    return createRequire(import.meta.url)("../../package.json").version ?? "0";
  } catch {
    return "0";
  }
}

/**
 * Identity of every input that determines the emitted registry's contents.
 *
 * The boundary mocks are compiled INTO the registry, so their SOURCE is hashed,
 * not just their module names: editing a mock's body has to invalidate the cache
 * the same way a Babel upgrade does. Hashing only the names meant a maintainer
 * changing a mock, or a user upgrading to a release that changed one, kept getting
 * the previous behaviour out of the cache with nothing to indicate it.
 *
 * This package's version is in the key for the same reason, covering everything
 * else it contributes — the transform's Babel options, platform resolution, the
 * emitted registry's own shape.
 */
function registryKey({ projectRoot, platform, reactNativeVersion }) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const version = (name) => {
    try {
      return req(`${name}/package.json`).version ?? "0";
    } catch {
      return "0";
    }
  };
  const boundaries = crypto.createHash("sha1");
  for (const suffix of Object.keys(BOUNDARY_SOURCES).sort()) {
    boundaries.update(suffix);
    boundaries.update("\0");
    boundaries.update(
      String(boundarySourceFor(`/react-native/${suffix}`, platform, reactNativeVersion)),
    );
    boundaries.update("\0");
  }
  return crypto
    .createHash("sha1")
    .update(
      [
        `f${REGISTRY_FORMAT_VERSION}`,
        ownVersion(),
        platform,
        reactNativeVersion,
        version("react-native"),
        version("@react-native/babel-preset"),
        version("@babel/core"),
        process.env.BABEL_ENV || process.env.NODE_ENV || "none",
        boundaries.digest("hex"),
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * True when every file the cached registry was built from is still present and
 * unchanged (same size and mtime). ~440 stats, a few milliseconds — cheap enough
 * to pay per run, and it means an edited or reinstalled React Native rebuilds
 * instead of silently serving stale code.
 */
function manifestValid(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) return false;
  for (const [file, mtimeMs, size] of manifest) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return false;
    }
    if (st.size !== size || st.mtimeMs !== mtimeMs) return false;
  }
  return true;
}

/** Base64-VLQ encode one signed integer (source-map segment field). */
function vlq(value) {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}

/**
 * A source map attributing each emitted line to the React Native file it came from.
 *
 * Without it, every stack frame from inside React Native reports the registry's
 * cache path — `rn-ios-<hash>.cjs:253:7638` instead of
 * `Libraries/Animated/nodes/AnimatedInterpolation.js`. The file is the useful part
 * of such a frame, and losing it makes an RN-internal failure far harder to read.
 *
 * Line granularity is enough here, and deliberately so: the Babel output for an RN
 * module is a single line, so the original line is always 1 and only the FILE is in
 * question. One segment per generated line keeps the map small (no `sourcesContent`
 * — the real files are on disk at these very paths) and costs nothing at runtime.
 */
function sourceMapFor(lineOwners, files) {
  let previousSource = 0;
  const mappings = lineOwners.map((owner) => {
    if (owner === null) return "";
    const segment = vlq(0) + vlq(owner - previousSource) + vlq(0) + vlq(0);
    previousSource = owner;
    return segment;
  });
  return { version: 3, sources: files, names: [], mappings: mappings.join(";") };
}

/**
 * Emit the registry source for the walked module set, plus the source map that
 * keeps React Native's own files identifiable in stack traces.
 */
function emit(files, modules) {
  const idOf = new Map(files.map((f, i) => [f, i]));
  const deps = files.map((f) => {
    const out = {};
    for (const [request, target] of Object.entries(modules.get(f).deps)) {
      out[request] = target === null ? null : (idOf.get(target) ?? target);
    }
    return JSON.stringify(out);
  });
  const prologue = [
    `"use strict";`,
    // __ext is this file's own require: the escape hatch for targets outside the
    // registry (react, invariant, JSON, anything computed). Pre-resolved absolute
    // paths make those lookups exact rather than re-running Node resolution.
    `const __ext = require, __f = [], __m = [];`,
    `const __ids = ${JSON.stringify(files)};`,
    `const __deps = [${deps.join(",")}];`,
    `const __dirs = __ids.map((f) => f.slice(0, Math.max(f.lastIndexOf("/"), f.lastIndexOf("\\\\"))));`,
    `function __req(i) {`,
    `  const map = __deps[i];`,
    `  const r = function (q) {`,
    `    const t = map[q];`,
    `    if (t === undefined || t === null) return __ext(q);`,
    `    return typeof t === "number" ? __r(t) : __ext(t);`,
    `  };`,
    `  r.resolve = function (q) {`,
    `    const t = map[q];`,
    `    if (t === undefined || t === null) return __ext.resolve(q);`,
    `    return typeof t === "number" ? __ids[t] : t;`,
    `  };`,
    `  r.cache = __ext.cache;`,
    `  return r;`,
    `}`,
    // Cyclic requires resolve against the partially-filled exports object, exactly
    // as Node's loader does: the module record is published before its factory runs.
    `function __r(i) {`,
    `  const hit = __m[i];`,
    `  if (hit !== undefined) return hit.exports;`,
    `  const mod = { id: __ids[i], filename: __ids[i], exports: {}, loaded: false, children: [], paths: [] };`,
    `  __m[i] = mod;`,
    `  try {`,
    `    __f[i](mod, mod.exports, __req(i), __ids[i], __dirs[i]);`,
    `  } catch (e) {`,
    `    __m[i] = undefined;`,
    `    throw e;`,
    `  }`,
    `  mod.loaded = true;`,
    `  return mod.exports;`,
    `}`,
  ];
  const epilogue = [
    // The entry's exports are the module's value, so `require(registry)` behaves
    // like `require('react-native')`. __registry is the lookup surface the install
    // hook uses to serve deep paths from the same instances.
    `const __entry = __r(0);`,
    `module.exports = __entry;`,
    `Object.defineProperty(module.exports, "__vitestNativeRegistry", {`,
    `  value: { ids: __ids, load: __r, entry: __ids[0] },`,
    `  enumerable: false, configurable: true,`,
    `});`,
  ];

  // Track which module each emitted line belongs to, so the source map can point
  // stack frames back at the real React Native file. A factory body may span
  // several lines (the boundary mocks do), and every one of those lines is
  // attributed, so a frame can never bleed onto the previous module's mapping.
  const lines = [...prologue];
  const lineOwners = prologue.map(() => null);
  files.forEach((f, i) => {
    const factory = `__f[${i}] = function (module, exports, require, __filename, __dirname) {${modules.get(f).code}\n};`;
    for (const line of factory.split("\n")) {
      lines.push(line);
      lineOwners.push(i);
    }
  });
  for (const line of epilogue) {
    lines.push(line);
    lineOwners.push(null);
  }
  return { code: lines.join("\n"), map: sourceMapFor(lineOwners, files) };
}

/**
 * Build (or reuse) the precompiled registry for a project. Returns the registry
 * file path, or null when a registry cannot be produced — in which case the caller
 * simply keeps using the per-file hooks.
 */
export function buildRegistry({
  projectRoot,
  platform = "ios",
  reactNativeVersion = "0.0.0",
  assetExts = [],
  diagnostics = false,
}) {
  // Escape hatch. The registry is transparent by design, but it is also the piece
  // most likely to be implicated if a project sees something unexpected from React
  // Native — so there is a way to take it out of the picture and get the per-file
  // loader back without downgrading.
  if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") {
    if (diagnostics) {
      console.log(
        "[vitest-native] (native) VITEST_NATIVE_NO_REGISTRY=1 — using per-file module loading",
      );
    }
    return null;
  }
  let dir;
  let key;
  try {
    key = registryKey({ projectRoot, platform, reactNativeVersion });
    dir = path.join(cacheRootFor(projectRoot), "registry");
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }

  const registryFile = path.join(dir, `rn-${platform}-${key}.cjs`);
  const metaFile = `${registryFile}.json`;
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (meta.key === key && fs.existsSync(registryFile) && manifestValid(meta.manifest)) {
      if (diagnostics) {
        console.log(
          `[vitest-native] (native) reusing precompiled RN registry (${meta.count} modules)`,
        );
      }
      return registryFile;
    }
  } catch {
    // No usable cache entry — build one below.
  }

  const started = Date.now();
  const assetExtSet = new Set(assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
  const options = { projectRoot, platform, reactNativeVersion, assetExtSet };
  const modules = new Map();
  const manifest = [];
  try {
    const entry = createRequire(path.join(projectRoot, "package.json")).resolve("react-native");
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop();
      if (modules.has(file)) continue;
      const { code, scan } = sourceFor(file, options);
      const deps = {};
      if (scan) {
        for (const match of code.matchAll(REQUIRE_RE)) {
          const request = match[2];
          if (request in deps) continue;
          const target = resolveTarget(request, file, platform);
          // Only React Native's own graph is inlined. Everything else — react,
          // invariant, JSON manifests, native addons — stays a normal Node require
          // at a pre-resolved absolute path, so those modules keep their usual
          // identity and are shared with the rest of the worker.
          const internal =
            target !== null &&
            RN_PATH.test(target.replace(/\\/g, "/")) &&
            !PASSTHROUGH_EXT.has(path.extname(target).toLowerCase());
          deps[request] = target;
          if (internal) queue.push(target);
        }
      }
      modules.set(file, { code, deps });
      const st = fs.statSync(file);
      manifest.push([file, st.mtimeMs, st.size]);
    }

    const files = [...modules.keys()];
    const { code, map } = emit(files, modules);
    // Write via a unique temp file then rename: several workers may race here on a
    // cold cache, and a reader must never observe a partially written registry.
    // The map lands before the registry that points at it, so a reader can never
    // find the reference without the file.
    const mapFile = `${registryFile}.map`;
    const mapTmp = `${mapFile}.${process.pid}.tmp`;
    fs.writeFileSync(mapTmp, JSON.stringify(map));
    fs.renameSync(mapTmp, mapFile);
    const tmp = `${registryFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${code}\n//# sourceMappingURL=${path.basename(mapFile)}\n`);
    fs.renameSync(tmp, registryFile);
    fs.writeFileSync(
      `${metaFile}.${process.pid}.tmp`,
      JSON.stringify({ key, count: files.length, manifest }),
    );
    fs.renameSync(`${metaFile}.${process.pid}.tmp`, metaFile);
    if (diagnostics) {
      console.log(
        `[vitest-native] (native) precompiled RN registry: ${files.length} modules in ${Date.now() - started}ms`,
      );
    }
    return registryFile;
  } catch (error) {
    if (diagnostics) {
      console.warn(
        `[vitest-native] (native) could not precompile the RN registry (${error?.message}); ` +
          `falling back to per-file module loading.`,
      );
    }
    return null;
  }
}

/**
 * Serve React Native from the precompiled registry in this worker.
 *
 * Installed BEFORE the require hooks so that the hooks' preset-mock redirect wraps
 * (and therefore takes precedence over) this one — a preset-shadowed package must
 * still win over anything RN's own graph would provide.
 */
export function installRegistry(registryFile, projectRoot) {
  if (globalThis.__vitest_native_registry_installed) return true;
  const req = createRequire(path.join(projectRoot, "package.json"));
  // Must precede the require below: Node reads `//# sourceMappingURL` when a script
  // is COMPILED, so enabling support afterwards leaves this registry unmapped and
  // every React Native stack frame pointing at the cache file instead of the RN
  // source it came from.
  try {
    process.setSourceMapsEnabled?.(true);
  } catch {
    // Older Node, or a host that has locked this down — frames stay unmapped.
  }
  let registry;
  try {
    registry = req(registryFile).__vitestNativeRegistry;
    if (!registry) return false;
  } catch {
    return false;
  }
  globalThis.__vitest_native_registry_installed = true;

  const idOf = new Map(registry.ids.map((f, i) => [f, i]));
  const entryId = idOf.get(registry.entry);
  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === "react-native") return registry.load(entryId);
    // An absolute path lands here when something re-enters through Node's loader
    // with an already-resolved file — most importantly the ESM loader's
    // `react-native/index.js` facade, which requires the real index by path.
    const direct = idOf.get(request);
    if (direct !== undefined) return registry.load(direct);
    // Deep imports of RN internals (`react-native/Libraries/…`) and of the
    // @react-native/* packages inlined alongside it must resolve to the SAME
    // instances the entry graph uses, or RN's singletons would exist twice.
    if (request.startsWith("react-native/") || request.startsWith("@react-native/")) {
      const resolver = parent?.filename ? createRequire(parent.filename) : req;
      let resolved;
      try {
        resolved = resolver.resolve(request);
      } catch {
        resolved = null;
      }
      const id = resolved === null ? undefined : idOf.get(resolved);
      if (id !== undefined) return registry.load(id);
    }
    return origLoad.call(this, request, parent, ...rest);
  };
  return true;
}
