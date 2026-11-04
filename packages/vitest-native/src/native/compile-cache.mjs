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
    enable.call(nodeModule, path.join(root, "v8"));
    // No atomic-write handling needed (unlike the transform cache, which writes
    // executable source): Node CRC32-validates each compile-cache entry on read,
    // so a torn or raced write from concurrent workers is a cache miss and a
    // recompile, never a corruption-induced failure.
  } catch {
    // Read-only tmp, unsupported platform, etc. — caching is a pure optimization.
  }
}
