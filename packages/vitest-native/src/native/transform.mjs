// Flow-strips a React Native source file via the project's @react-native/babel-preset
// (the only transformer that lowers RN's `component` syntax). Used by BOTH the loader
// hook (import) and the require hook, which run in separate threads: each gets its own
// instance of this module, so the in-memory `mem` cache below is per-thread (no shared
// mutable state to race on). The disk cache — keyed by CONTENT hash + platform, in a
// directory versioned by preset + @babel/core versions — is the layer shared across
// threads, workers, runs, and (because content-keyed entries survive fresh installs
// and mtime normalization) CI cache restores. The path is part of the key too —
// Babel output embeds the filename — so restores are valid wherever the checkout
// path is stable (CI runners use a fixed workspace path).
//
// @babel/core itself is loaded lazily, only on a cache MISS: on a warm cache the
// default engine pays this module's init in every isolated worker, and requiring
// Babel costs ~35ms vs ~0.5ms for resolving versions — pure waste when every file
// is served from disk.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

let _req;
let _babel;
let _preset;
let _cacheDir;
let _writeSeq = 0;
const mem = new Map();
const TRANSFORM_CACHE_VERSION = 3;

/**
 * Root directory for vitest-native's on-disk caches. Prefers the project's
 * node_modules/.cache — persistent across runs, per-project, and restorable by
 * standard CI dependency-cache actions (unlike os.tmpdir(), which is ephemeral
 * on CI runners and periodically purged on macOS). Falls back to tmpdir when
 * node_modules is absent or unwritable.
 */
export function cacheRootFor(projectRoot) {
  const nm = path.join(projectRoot, "node_modules");
  if (fs.existsSync(nm)) {
    try {
      const dir = path.join(nm, ".cache", "vitest-native");
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // Read-only node_modules (some CI sandboxes) — fall through to tmpdir.
    }
  }
  const dir = path.join(os.tmpdir(), "vitest-native-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function init(projectRoot) {
  if (_cacheDir) return;
  _req = createRequire(path.join(projectRoot, "package.json"));
  let presetVersion;
  let babelVersion;
  try {
    // Resolve-only here (cheap); the actual require of @babel/core happens
    // lazily on the first cache miss.
    _preset = _req.resolve("@react-native/babel-preset");
    _req.resolve("@babel/core");
    presetVersion = _req("@react-native/babel-preset/package.json").version;
    babelVersion = _req("@babel/core/package.json").version;
  } catch {
    throw new Error(
      "[vitest-native] engine 'native' requires '@react-native/babel-preset' and " +
        "'@babel/core' in your project. Install them as devDependencies " +
        "(they ship with React Native projects by default).",
    );
  }
  // Both transformer versions key the directory — a preset or Babel upgrade
  // must never serve output produced by the previous version — and so does the
  // Babel environment: the preset's dev-mode JSX transform produces different
  // output (e.g. _jsxFileName injection) under NODE_ENV=development than under
  // test/production.
  const babelEnv = process.env.BABEL_ENV || process.env.NODE_ENV || "none";
  _cacheDir = path.join(
    cacheRootFor(projectRoot),
    `transform-${presetVersion}-b${babelVersion}-${babelEnv}-v${TRANSFORM_CACHE_VERSION}`,
  );
  fs.mkdirSync(_cacheDir, { recursive: true });
}

/** The active transform disk-cache directory (resolved on first use). Test hook. */
export function transformCacheDir() {
  return _cacheDir ?? null;
}

/** Returns true if the source contains RN Flow syntax that must be transformed. */
export function isFlow(src) {
  return /@flow|import typeof|\bcomponent\s+\w/.test(src);
}

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */
export function transformRN(file, src, projectRoot, platform = "ios") {
  init(projectRoot);
  // The in-memory key uses mtime+size (one statSync) so the hot path skips
  // hashing; the DISK key hashes the actual content, so entries stay valid
  // across fresh installs, Docker mtime normalization, and CI cache restores —
  // and a same-path file with different content can never produce a wrong hit.
  // The FILENAME is part of the key because Babel's output depends on it: the
  // preset embeds the absolute path (_jsxFileName) in transformed JSX, so two
  // identical sources at different paths must not share an entry.
  const st = fs.statSync(file);
  const memKey = `${platform}\0${file}\0${st.mtimeMs}\0${st.size}`;
  const memHit = mem.get(memKey);
  if (memHit !== undefined) return memHit;

  const key = crypto
    .createHash("sha1")
    .update(platform)
    .update("\0")
    .update(file)
    .update("\0")
    .update(src)
    .digest("hex");
  const cachePath = path.join(_cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    mem.set(memKey, cached);
    return cached;
  } catch {}

  if (!_babel) _babel = _req("@babel/core");
  const out = _babel.transformSync(src, {
    filename: file,
    presets: [[_preset, { disableStaticViewConfigsCodegen: true }]],
    babelrc: false,
    configFile: false,
    caller: { name: "metro", bundler: "metro", platform, supportsStaticESM: false },
  }).code;
  // Atomic write: multiple worker threads may transform the same RN file
  // concurrently on a cold cache. Write to a unique temp file then rename
  // (atomic on POSIX same-dir) so a concurrent reader never sees a partial file.
  const tmp = `${cachePath}.${process.pid}.${_writeSeq++}.tmp`;
  try {
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, cachePath);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
  mem.set(memKey, out);
  return out;
}
