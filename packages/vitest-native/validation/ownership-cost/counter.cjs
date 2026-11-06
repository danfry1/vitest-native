// Preloaded into the Vitest process and every worker thread (NODE_OPTIONS=--require):
// counts the file-system calls and CommonJS resolutions each thread makes. Installed
// before vitest-native loads, so the engine's own wrappers sit above these and every
// call they pass on is counted once.
const fs = require("node:fs");
const Module = require("node:module");
const { threadId } = require("node:worker_threads");

const counts = { resolve: 0, realpath: 0, stat: 0, read: 0, readdir: 0, exists: 0, compile: 0 };
const wrap = (owner, name, key) => {
  const original = owner[name];
  if (typeof original !== "function") return;
  const wrapped = function (...args) {
    counts[key]++;
    return original.apply(this, args);
  };
  Object.assign(wrapped, original);
  owner[name] = wrapped;
};
const nativeRealpath = fs.realpathSync.native;
wrap(fs, "realpathSync", "realpath");
fs.realpathSync.native = function (...args) {
  counts.realpath++;
  return nativeRealpath.apply(this, args);
};
wrap(fs, "statSync", "stat");
wrap(fs, "lstatSync", "stat");
wrap(fs, "readFileSync", "read");
wrap(fs, "readdirSync", "readdir");
wrap(fs, "existsSync", "exists");
wrap(Module, "_resolveFilename", "resolve");
wrap(Module.prototype, "_compile", "compile");
fs.syncBuiltinESMExports?.();
globalThis[Symbol.for("vn-cost-counts")] = counts;

const out = process.env.VN_COST_OUT;
if (out && threadId === 0) {
  process.on("exit", () => {
    fs.appendFileSync(out, `${JSON.stringify({ thread: "main", counts })}\n`);
  });
}
