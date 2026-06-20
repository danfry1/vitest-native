// Flow-strips a React Native source file via the project's @react-native/babel-preset
// (the only transformer that lowers RN's `component` syntax). Used by BOTH the loader
// hook (import) and the require hook, which run in separate threads: each gets its own
// instance of this module, so the in-memory `mem` cache below is per-thread (no shared
// mutable state to race on). The disk cache — keyed by path + mtime + size + preset
// version — is the layer shared across them.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

let _babel;
let _preset;
let _cacheDir;
let _writeSeq = 0;
const mem = new Map();
const TRANSFORM_CACHE_VERSION = 2;

function init(projectRoot) {
  if (_babel) return;
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    _babel = req("@babel/core");
    _preset = req.resolve("@react-native/babel-preset");
  } catch {
    throw new Error(
      "[vitest-native] engine 'native' requires '@react-native/babel-preset' and " +
        "'@babel/core' in your project. Install them as devDependencies " +
        "(they ship with React Native projects by default).",
    );
  }
  const presetVersion = req("@react-native/babel-preset/package.json").version;
  _cacheDir = path.join(
    os.tmpdir(),
    "vitest-native-cache",
    `${presetVersion}-v${TRANSFORM_CACHE_VERSION}`,
  );
  fs.mkdirSync(_cacheDir, { recursive: true });
}

/** Returns true if the source contains RN Flow syntax that must be transformed. */
export function isFlow(src) {
  return /@flow|import typeof|\bcomponent\s+\w/.test(src);
}

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */
export function transformRN(file, src, projectRoot, platform = "ios") {
  init(projectRoot);
  const st = fs.statSync(file);
  const memKey = `${platform}\0${file}\0${st.mtimeMs}\0${st.size}`;
  const memHit = mem.get(memKey);
  if (memHit !== undefined) return memHit;

  const key = crypto
    .createHash("sha1")
    .update(platform + ":" + file + ":" + st.mtimeMs + ":" + st.size)
    .digest("hex");
  const cachePath = path.join(_cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    mem.set(memKey, cached);
    return cached;
  } catch {}

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
