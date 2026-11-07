// Measurement only (throwaway perf branch): counts fs calls in this process's main thread
// and prints the totals at exit.
import fs from "node:fs";
const counts = { realpathNative: 0, realpathJs: 0, statSync: 0, existsSync: 0, readFileSync: 0 };
const wrap = (obj, key, name) => { const f = obj[key]; const w = function (...a) { counts[name]++; return f.apply(this, a); }; Object.assign(w, f); obj[key] = w; return w; };
const native = fs.realpathSync.native;
const js = wrap(fs, "realpathSync", "realpathJs");
js.native = function (...a) { counts.realpathNative++; return native.apply(this, a); };
wrap(fs, "statSync", "statSync"); wrap(fs, "existsSync", "existsSync"); wrap(fs, "readFileSync", "readFileSync");
process.on("exit", () => { if (process.env.VN_COUNT_FS_PRINT === "1") process.stderr.write(`FSCOUNT ${process.pid} ${JSON.stringify(counts)}\n`); });
