// What the native engine asks of Babel, wherever Babel runs (see transform.mjs, "Where
// Babel runs"): `config`, the project's Babel options for a file (loadPartialConfig),
// and `transform` (transformSync). Loaded by babel-worker.mjs on Babel's own thread,
// and by transform.mjs in a process that runs no test code (the registry compiler).
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

// One @babel/core per project root.
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

/** Answers one request: `{ kind: "config" | "transform", root, … }`. Throws Babel's errors. */
export function handleToolchainRequest(request) {
  return request.kind === "config" ? config(request) : transform(request);
}
