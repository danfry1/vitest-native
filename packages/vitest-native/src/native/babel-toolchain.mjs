// What the native engine asks of Babel, wherever Babel runs (see transform.mjs, "Where
// Babel runs"): `config`, the project's Babel options for a file (loadPartialConfig),
// and `transform` (transformSync). Loaded by babel-worker.mjs on Babel's own thread,
// and by transform.mjs in a process that runs no test code (the registry compiler).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";
import { esmImportInterop } from "./esm-interop.mjs";

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

// `import.meta` in a file Node loads. Every file this toolchain compiles runs as
// CommonJS, which has no `import.meta`: left in, it is "Cannot use 'import.meta' outside
// a module", as under Jest with babel-jest alone. The three properties CommonJS has an
// answer for get it, as babel-plugin-transform-import-meta gives them under Jest; any
// other (`env`, `hot`, `glob`, `resolve`, `import.meta` itself) is a bundler's or the ESM
// loader's, and fails by name. Decided once every other visitor is done (`post`), so a
// preset or project plugin that lowers `import.meta` its own way (babel-preset-expo's
// registry, the project's own plugin) keeps that answer, as under Jest.

/** A superset of the sources holding `import.meta`, comments allowed around the dot. */
export const IMPORT_META =
  /\bimport\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*\.\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*meta\b/;

/** The lowering's revision, which keys compiled output of files that hold `import.meta`. */
export const IMPORT_META_LOWERING = "import-meta-cjs-1";

const IMPORT_META_VALUES = {
  url: 'require("node:url").pathToFileURL(__filename).href',
  filename: "__filename",
  dirname: "__dirname",
};

/** The Babel plugin, for a file under `root`. */
export function importMetaToCommonJS(root) {
  return ({ template, types: t }) => ({
    name: "vitest-native-import-meta",
    post(file) {
      const program = file.path;
      // Declared once at the top, where `require`, `__filename` and `__dirname` are the
      // module wrapper's whatever a nested scope names its own.
      const ids = new Map();
      program.traverse({
        MetaProperty(meta) {
          const { node } = meta;
          if (node.meta.name !== "import" || node.property.name !== "meta") return;
          const member = meta.parentPath;
          const isMember =
            (member.isMemberExpression() || member.isOptionalMemberExpression()) &&
            member.node.object === node;
          const key = isMember ? member.node.property : null;
          let name = null;
          if (key && !member.node.computed) name = key.name;
          else if (key && t.isStringLiteral(key)) name = key.value;
          if (!Object.hasOwn(IMPORT_META_VALUES, name)) {
            throw importMetaUnsupported(file.opts.filename, root, name, node.loc?.start);
          }
          if (!ids.has(name)) {
            ids.set(name, program.scope.generateUidIdentifier(`importMeta_${name}`));
          }
          member.replaceWith(t.cloneNode(ids.get(name)));
        },
      });
      if (ids.size === 0) return;
      const declarators = [...ids].map(([name, id]) =>
        t.variableDeclarator(id, template.expression.ast(IMPORT_META_VALUES[name])),
      );
      program.unshiftContainer("body", t.variableDeclaration("var", declarators));
    },
  });
}

function importMetaUnsupported(file, root, name, at) {
  const what = name === null ? "`import.meta`" : `\`import.meta.${name}\``;
  const rel = file.startsWith(root + path.sep) ? path.relative(root, file) : file;
  const shown = rel.split(path.sep).join("/");
  const where = at ? `${shown}:${at.line}:${at.column + 1}` : shown;
  const pkg = owningPackage(file, root);
  const fix = pkg
    ? `To fix it, let Vite load '${pkg}': add it to \`transform: { exclude: [...] }\` in ` +
      `reactNative()'s options. Or do not use ${what} in code Node loads.`
    : `To fix it, import the file from the test so Vite loads it, rather than requiring it ` +
      `(require(), jest.requireActual). Or do not use ${what} in code Node loads.`;
  return new VitestNativeError(
    "IMPORT_META_IN_NODE_OWNED",
    `${what} in ${where} has no value here: Node loads this file compiled to CommonJS, ` +
      `which has no \`import.meta\`. Only \`import.meta.url\`, \`.filename\` and \`.dirname\` ` +
      `are given their CommonJS values. ${fix}`,
  );
}

/** The package holding `file`, or null for the project's own source. */
function owningPackage(file, root) {
  for (let dir = path.dirname(file); dir !== root && path.dirname(dir) !== dir;) {
    try {
      const name = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name;
      if (typeof name === "string") return name;
    } catch {
      // No manifest here, or no name: look further up.
    }
    dir = path.dirname(dir);
  }
  return null;
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
  // Added on this side: a plugin is a function, which does not cross threads.
  const added = [];
  if (!request.project && request.esmInterop) added.push(esmImportInterop);
  if (request.importMeta) added.push(importMetaToCommonJS(request.root));
  if (added.length > 0) options = { ...options, plugins: [...(options.plugins ?? []), ...added] };
  return { code: babel.transformSync(request.src, options).code };
}

/** Answers one request: `{ kind: "config" | "transform", root, … }`. Throws Babel's errors. */
export function handleToolchainRequest(request) {
  return request.kind === "config" ? config(request) : transform(request);
}
