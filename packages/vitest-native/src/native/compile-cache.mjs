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

let _enabled = false;

/**
 * Enable Node's persistent V8 compile cache for this worker/thread. Idempotent and
 * guarded per realm. Colocated under the `vitest-native-cache` tmp prefix so it
 * shares the transform cache's lifecycle (cleared with it on a cold run, reused on
 * warm). Must be called before RN's modules are first compiled.
 */
export function enableV8CompileCache() {
  if (_enabled) return;
  _enabled = true;
  const enable = nodeModule.enableCompileCache;
  if (typeof enable !== "function") return; // Node < 22.8: feature absent
  try {
    enable.call(nodeModule, path.join(os.tmpdir(), "vitest-native-cache-v8"));
  } catch {
    // Read-only tmp, unsupported platform, etc. — caching is a pure optimization.
  }
}
