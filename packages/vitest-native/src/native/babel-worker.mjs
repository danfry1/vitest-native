// The native engine's Babel, on a thread of its own (see transform.mjs, "Where Babel
// runs"). Started by transform.mjs on a thread's first compile, and answers one request
// at a time while the calling thread waits: `config` (the project's Babel options for a
// file, loadPartialConfig) and `transform` (transformSync). Nothing of the engine is
// loaded here, so Babel, its presets and its plugins load as published, and nothing the
// test files install on their own thread's globals can reach them.
import nodeModule, { createRequire } from "node:module";
import path from "node:path";
import { workerData } from "node:worker_threads";
import { VitestNativeError } from "../errors.mjs";

const { port, signal, compileCache } = workerData;

// Node's compile cache, on here exactly when it is on in the thread that started this
// one (compile-cache.mjs decides), so Babel's modules load from it as they did there.
if (compileCache && typeof nodeModule.enableCompileCache === "function") {
  try {
    nodeModule.enableCompileCache(compileCache);
  } catch {
    // A pure optimization, as in compile-cache.mjs.
  }
}

// One @babel/core per project root, as the calling thread had one per root.
const babels = new Map();
function babelFor(root) {
  let babel = babels.get(root);
  if (!babel) {
    babel = createRequire(path.join(root, "package.json"))("@babel/core");
    babels.set(root, babel);
  }
  return babel;
}

function loadPartial(request) {
  return babelFor(request.root).loadPartialConfig({
    filename: request.file,
    cwd: request.root,
    root: request.root,
    caller: request.caller,
  });
}

function config(request) {
  const partial = loadPartial(request);
  if (partial === null) return { kind: "ignored" };
  if (!partial.hasFilesystemConfig()) return { kind: "none" };
  return {
    kind: "project",
    options: JSON.stringify(partial.options),
    config: partial.config ?? null,
    babelrc: partial.babelrc ?? null,
  };
}

function transform(request) {
  const babel = babelFor(request.root);
  let options = request.options;
  if (request.project) {
    // Loaded again here rather than carried over: the loaded options hold the
    // project's plugin instances, which do not cross threads. About 0.1 ms per file.
    const partial = loadPartial(request);
    // The configuration was asked first (projectBabelOptions), so only a file edited
    // in between reaches this.
    if (partial === null) {
      throw new VitestNativeError("BABEL_IGNORES_FILE", `Babel ignores ${request.file}.`);
    }
    options = partial.options;
  }
  return { code: babel.transformSync(request.src, options).code };
}

function answer(message) {
  port.postMessage(message);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

port.on("message", (request) => {
  try {
    answer({ ok: request.kind === "config" ? config(request) : transform(request) });
  } catch (err) {
    answer({
      error: {
        name: err?.name ?? "Error",
        message: err?.message ?? String(err),
        code: err?.code,
        stack: err?.stack,
      },
    });
  }
});

// The caller is blocked until it is answered: a thread that ends for any reason says
// so rather than leaving it waiting.
process.on("exit", () => {
  Atomics.store(signal, 1, 1);
  Atomics.store(signal, 0, 2);
  Atomics.notify(signal, 0);
});
