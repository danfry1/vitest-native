// V8 compile-cache for the externalized React Native graph.
//
// RN is loaded through Node (externalized), and our require/loader hooks compile
// each RN module's Flow-stripped source with `mod._compile` / a synthetic module
// source. The transform disk cache (transform.mjs) means Babel runs once per RN
// version — but V8 still re-parses and re-compiles that source to bytecode on
// every fresh module graph. Under `engine:'native'` (isolate:true) RN's ~240-file
// graph is re-instantiated per test FILE, so that V8 compile is paid over and
// over. Node's on-disk compile cache (Node 22.8+) keys bytecode by source content
// + Node version and is shared process-wide, so the second compile of any RN
// module — the next file, the next worker, the next run — loads bytecode instead
// of recompiling. Verified to apply to `mod._compile`, which is how the hooks load
// RN. No-op on Node < 22.8 (the API is absent) and harmless when caching is off.
import fs from "node:fs";
import nodeModule from "node:module";
import os from "node:os";
import path from "node:path";
import { cacheRootFor } from "./transform.mjs";

// Decided once per thread, on the global object rather than in module scope: under
// the hot runtime the setup file can reach a second copy of this module, and its
// call must not undo the worker's decision.
const DECIDED = "__vitest_native_v8_compile_cache";

/**
 * Enable Node's persistent V8 compile cache for this worker/thread. Idempotent: the
 * first call in a thread decides. Colocated with the transform disk cache (the
 * project's node_modules/.cache/vitest-native when available — persistent and
 * CI-restorable — else tmpdir) so both caches share a lifecycle. Must be called
 * before RN's modules are first compiled.
 *
 * `skip` leaves the cache off for the thread. The hot runtime passes it while ESM
 * generation is on: each test file re-evaluates the externalized ES modules it
 * imports under a new URL (`?vnhot=N`, loader.mjs), and Node keys compile-cache
 * entries by URL, so the cache would gain one entry per module per file. Node
 * writes them all when the worker exits, inside Vitest's teardownTimeout, and a
 * resident worker compiles React Native once anyway, so the cache saves nothing
 * there.
 */
export function enableV8CompileCache(projectRoot, { skip = false } = {}) {
  if (globalThis[DECIDED]) return;
  globalThis[DECIDED] = skip ? "off" : "on";
  if (skip) return;
  const enable = nodeModule.enableCompileCache;
  if (typeof enable !== "function") return; // Node < 22.8: feature absent
  try {
    const root = projectRoot
      ? cacheRootFor(projectRoot)
      : path.join(os.tmpdir(), "vitest-native-cache");
    const dir = path.join(root, "v8");
    if (!writesColdCache() && !holdsEntries(dir)) {
      globalThis[DECIDED] = "off";
      return;
    }
    enable.call(nodeModule, dir);
    // No atomic-write handling needed (unlike the transform cache, which writes
    // executable source): Node CRC32-validates each compile-cache entry on read,
    // so a torn or raced write from concurrent workers is a cache miss and a
    // recompile, never a corruption-induced failure.
  } catch {
    // Read-only tmp, unsupported platform, etc. — caching is a pure optimization.
  }
}

// A cold cache is written by one worker (#831). Every worker compiles the same modules,
// so each held the same entries and wrote them all when it exited, inside the pool's
// close: a cold four-worker run wrote 535 entries for 158 distinct ones, and on a loaded
// Windows runner the writes held close for up to 14 s. The first pool worker writes
// them; the others compile as Node does without the cache, which costs them nothing on
// a cold cache, where there is nothing to read. Once the cache holds entries every
// worker reads it, and writes only what it lacked. Outside a Vitest pool (no
// VITEST_POOL_ID) the one thread is the writer.
function writesColdCache() {
  return (process.env.VITEST_POOL_ID ?? "1") === "1";
}

/**
 * Whether Node has written compile-cache entries under `dir` for this Node. It keeps
 * them per build, in a directory named `v<version>-<arch>-…`; another Node's entries
 * are never read by this one.
 */
function holdsEntries(dir) {
  let builds;
  try {
    builds = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const thisNode = `v${process.versions.node}-${process.arch}-`;
  for (const build of builds) {
    if (!build.isDirectory() || !build.name.startsWith(thisNode)) continue;
    const entries = fs.opendirSync(path.join(dir, build.name));
    try {
      if (entries.readSync() !== null) return true;
    } finally {
      entries.closeSync();
    }
  }
  return false;
}
