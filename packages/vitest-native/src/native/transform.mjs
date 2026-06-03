// Flow-strips a React Native source file via the project's @react-native/babel-preset
// (the only transformer that lowers RN's `component` syntax). Disk-cached by
// path + mtime + size + preset version. Used by BOTH the loader hook (import) and
// the require hook — they run in separate threads, so this module is stateless.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

let _babel;
let _preset;
let _cacheDir;
const mem = new Map();

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
  _cacheDir = path.join(os.tmpdir(), "vitest-native-cache", presetVersion);
  fs.mkdirSync(_cacheDir, { recursive: true });
}

/** Returns true if the source contains RN Flow syntax that must be transformed. */
export function isFlow(src) {
  return /@flow|import typeof|\bcomponent\s+\w/.test(src);
}

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */
export function transformRN(file, src, projectRoot) {
  init(projectRoot);
  const memHit = mem.get(file);
  if (memHit !== undefined) return memHit;

  const st = fs.statSync(file);
  const key = crypto
    .createHash("sha1")
    .update(file + ":" + st.mtimeMs + ":" + st.size)
    .digest("hex");
  const cachePath = path.join(_cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    mem.set(file, cached);
    return cached;
  } catch {}

  const out = _babel.transformSync(src, {
    filename: file,
    presets: [_preset],
    babelrc: false,
    configFile: false,
    caller: { name: "metro", bundler: "metro", platform: "ios", supportsStaticESM: false },
  }).code;
  fs.writeFileSync(cachePath, out);
  mem.set(file, out);
  return out;
}
