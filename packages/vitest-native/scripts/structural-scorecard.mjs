// Structural scorecard: a ratchet on the runtime's riskiest structural patterns.
//
// The runtime is being rebuilt toward its target architecture inside v1, one layer at
// a time. Each layer is meant to REMOVE patching, not add to it, so the counts below
// may only fall. This counts them in src/ and compares with scorecard.json:
//
// - nodePatchSites: writes to Node's module internals (Module._load,
//   _resolveFilename, _extensions[…], Module.prototype._compile, require.extensions),
//   dotted, string-keyed, through Reflect.set / defineProperty / defineProperties /
//   Object.assign, or through a local alias of _extensions; and loader-hook installs
//   (node:module's register / registerHooks, named, namespace or default import).
//   Restoring a saved original is a write too and counts: every site is a place the
//   realm is mutated.
// - envVars: distinct VITEST_NATIVE_* names, each an undocumented switch to support.
// - globals: distinct __vitest_native_* names, each a channel around module scope.
// - swallowedCatches: catch blocks with nothing in them but whitespace, comments,
//   no-ops (`void 0`, `undefined`, `;`) or a bare `return;` / `continue;` / `break;`,
//   and `.catch(() => {})` / `.catch(() => undefined)`. A catch that returns a value
//   (`return null`) is a fallback and is not counted.
//
// A RISE fails. A fall fails too until scorecard.json is lowered to match, so an
// improvement is locked in by the change that makes it (`--update` writes the new
// counts, and refuses while any count is above its baseline). Comments are stripped
// before counting: the source explains its patches at length, and an explanation is
// not a patch.
//
// This is a TRIPWIRE FOR HONEST CODE, not an enforcement boundary. It reads text
// with regular expressions after a small scanner, so a computed key (`Module[k] =`),
// a helper that does the write (`patch(Module, "_load", f)`) or an alias of Module
// itself goes uncounted. That is deliberate: chasing every indirection would make
// this a JavaScript analyser. Its job is to make the ordinary ways of adding a
// patch, a switch, a global or a swallowed error show up in review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_PATH = path.join(packageRoot, "scorecard.json");
export const METRICS = ["nodePatchSites", "envVars", "globals", "swallowedCatches"];

/**
 * `source` with comments blanked (newlines kept), skipping over strings, template
 * literals and regular-expression literals so a `//` inside one survives. With
 * `blankStrings`, the text inside string and template literals is blanked too.
 */
export function stripComments(source, { blankStrings = false } = {}) {
  let out = "";
  let i = 0;
  let last = "";
  let lastWord = "";
  const templates = [];
  // For each open paren, whether a keyword (`if (…) /re/`) or an expression
  // (`(a) / b`) introduced it, so a `/` after the matching `)` reads right.
  const parens = [];
  let closedKeywordParen = false;
  const REGEX_AFTER_WORD =
    /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
  const regexMayStart = () =>
    last === "" ||
    /[(,=:[!&|?{};+\-*%<>~^]/.test(last) ||
    (last === ")" && closedKeywordParen) ||
    (/\w/.test(last) && REGEX_AFTER_WORD.test(lastWord));
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`" || (ch === "}" && templates.at(-1) === 0)) {
      const quote = ch === "}" ? "`" : ch;
      if (ch === "}") templates.pop();
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") j += 2;
        else if (source[j] === quote) break;
        else if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
          templates.push(0);
          j += 1;
          break;
        } else j++;
      }
      const literal = source.slice(i, j + 1);
      out += blankStrings
        ? literal[0] + literal.slice(1, -1).replace(/[^\n]/g, " ") + literal.slice(-1)
        : literal;
      i = j + 1;
      last = '"';
      continue;
    }
    if (ch === "/" && regexMayStart()) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== "\n") {
        if (source[j] === "\\") j += 2;
        else if (source[j] === "[" || source[j] === "]") {
          inClass = source[j] === "[";
          j++;
        } else if (source[j] === "/" && !inClass) break;
        else j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
      last = "/";
      continue;
    }
    if (templates.length > 0) {
      if (ch === "{") templates[templates.length - 1]++;
      else if (ch === "}") templates[templates.length - 1]--;
    }
    if (ch === "(") parens.push(/^(?:if|while|for|with)$/.test(lastWord) && /\w/.test(last));
    if (ch === ")") closedKeywordParen = parens.pop() ?? false;
    out += ch;
    if (/\w/.test(ch)) lastWord = /\w/.test(last) && last === source[i - 1] ? lastWord + ch : ch;
    if (!/\s/.test(ch)) last = ch;
    i++;
  }
  return out;
}

const ASSIGN = String.raw`\s*=(?![=>])`;
const PATCH_ASSIGNMENTS = [
  new RegExp(String.raw`\._load${ASSIGN}`, "g"),
  new RegExp(String.raw`\._resolveFilename${ASSIGN}`, "g"),
  new RegExp(String.raw`\._extensions\s*(?:\[[^\]\n]+\]|\.\w+)${ASSIGN}`, "g"),
  new RegExp(String.raw`\.prototype\._compile${ASSIGN}`, "g"),
  new RegExp(String.raw`\brequire\.extensions\s*(?:\[[^\]\n]+\]|\.\w+)${ASSIGN}`, "g"),
];
// The same patches spelled with a string key or through defineProperty, which the
// dotted forms above cannot see. Matched against code with strings intact.
const INTERNAL = String.raw`["'](?:_load|_resolveFilename|_compile|_extensions)["']`;
const PATCH_SPELLINGS = [
  new RegExp(String.raw`\[\s*${INTERNAL}\s*\]\s*(?:\[[^\]\n]+\]\s*)?=(?![=>])`, "g"),
  new RegExp(String.raw`\b(?:defineProperty|Reflect\.set)\(\s*[\w.]+\s*,\s*${INTERNAL}`, "g"),
];
// Object.assign(Module, { _load }) / Object.defineProperties(Module, { _load: … }).
const PATCH_OBJECT_WRITES =
  /\bObject\.(?:assign|defineProperties)\(\s*[\w.]+\s*,\s*\{[^}]*?\b(?:_load|_resolveFilename|_compile|_extensions)\b\s*[:,}]/g;
// `const ext = Module._extensions;` (or require.extensions), then writes through it.
const EXTENSIONS_ALIAS =
  /\b(?:const|let|var)\s+(\w+)\s*=\s*[\w.]*(?:\._extensions|\brequire\.extensions)\s*[;\n]/g;
// import * as nm / import nm from / const nm = require("node:module").
const NODE_MODULE_NAMESPACE =
  /import\s*\*\s*as\s+(\w+)\s+from\s*["']node:module["']|import\s+(\w+)\s*(?:,\s*\{[^}]*\}\s*)?from\s*["']node:module["']|(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*["']node:module["']\s*\)/g;
const NODE_MODULE_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["']node:module["']|\{([^}]*)\}\s*=\s*require\(\s*["']node:module["']\s*\)/g;

/** Counts for one file's source. */
export function countSource(raw) {
  // Names are counted wherever code mentions them, strings included
  // (process.env[name], messages); patches and catches only in code itself.
  const code = stripComments(raw);
  const bare = stripComments(raw, { blankStrings: true });
  let nodePatchSites = 0;
  for (const pattern of PATCH_ASSIGNMENTS) nodePatchSites += [...bare.matchAll(pattern)].length;
  for (const pattern of PATCH_SPELLINGS) nodePatchSites += [...code.matchAll(pattern)].length;
  nodePatchSites += [...bare.matchAll(PATCH_OBJECT_WRITES)].length;
  for (const [, alias] of bare.matchAll(EXTENSIONS_ALIAS)) {
    const write = new RegExp(String.raw`(?<![.\w])${alias}\s*(?:\[[^\]\n]+\]|\.\w+)${ASSIGN}`, "g");
    nodePatchSites += [...bare.matchAll(write)].length;
  }
  // module.register(…) / Module.registerHooks(…), or through any namespace or default
  // import of node:module, called or taken (`const r = nm.register`); and the bare
  // names when imported from node:module (a manifest's own `register` is no hook).
  const namespaces = new Set(["module", "Module"]);
  for (const m of code.matchAll(NODE_MODULE_NAMESPACE)) namespaces.add(m[1] ?? m[2] ?? m[3]);
  for (const ns of namespaces) {
    const use = new RegExp(
      String.raw`(?<![.\w])${ns}\.register(?:Hooks)?(?:\s*\(|(?=\s*[;,)\n]))`,
      "g",
    );
    nodePatchSites += [...bare.matchAll(use)].length;
  }
  const imported = new Set();
  for (const m of code.matchAll(NODE_MODULE_IMPORT)) {
    for (const part of (m[1] ?? m[2]).split(",")) {
      const [name, alias] = part.trim().split(/\s+as\s+|\s*:\s*/);
      if (name === "register" || name === "registerHooks") imported.add(alias ?? name);
    }
  }
  for (const name of imported) {
    nodePatchSites += [...bare.matchAll(new RegExp(String.raw`(?<![.\w])${name}\s*\(`, "g"))]
      .length;
  }
  // A body of only no-op statements (`void 0;`, `undefined;`, `;`), optionally ending
  // in a bare `return;`, `continue;` or `break;`: the error is dropped and control
  // moves on as if nothing happened. A body that returns a value (`return null`) is a
  // fallback, not counted. Each repeat must consume a `;`, which keeps the pattern
  // free of nested optional repeats to backtrack through.
  const NO_OP = String.raw`\s*(?:(?:void\s+0|undefined|null)?\s*;\s*)*(?:(?:void\s+0|undefined|null|return|continue|break)\s*;?\s*)?`;
  const swallowedCatches =
    [...bare.matchAll(new RegExp(String.raw`\bcatch\s*(?:\([^)]*\))?\s*\{${NO_OP}\}`, "g"))]
      .length +
    [
      ...bare.matchAll(
        /\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|undefined|void\s+0|null)\s*\)/g,
      ),
    ].length;
  return {
    nodePatchSites,
    envVars: new Set(code.match(/\bVITEST_NATIVE_[A-Z0-9_]+/g) ?? []),
    globals: new Set(code.match(/\b__vitest_native_\w+/g) ?? []),
    swallowedCatches,
  };
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(?:mjs|cjs|js|ts|tsx)$/.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** The scorecard for a source tree (default: this package's src/). */
export function measure(srcDir = path.join(packageRoot, "src")) {
  const envVars = new Set();
  const globals = new Set();
  let nodePatchSites = 0;
  let swallowedCatches = 0;
  for (const file of sourceFiles(srcDir).sort()) {
    const counts = countSource(fs.readFileSync(file, "utf8"));
    nodePatchSites += counts.nodePatchSites;
    swallowedCatches += counts.swallowedCatches;
    for (const name of counts.envVars) envVars.add(name);
    for (const name of counts.globals) globals.add(name);
  }
  return { nodePatchSites, envVars: envVars.size, globals: globals.size, swallowedCatches };
}

/** Messages for every metric that differs from the baseline; empty when it matches. */
export function compare(actual, baseline) {
  const messages = [];
  for (const metric of METRICS) {
    const was = baseline[metric];
    const now = actual[metric];
    if (typeof was !== "number") messages.push(`${metric}: no baseline in scorecard.json`);
    else if (now > was) {
      messages.push(
        `${metric} ROSE from ${was} to ${now}. The in-place rebuild only removes these; ` +
          "find another way, or justify raising the baseline in review.",
      );
    } else if (now < was) {
      messages.push(
        `${metric} fell from ${was} to ${now}. Lock the improvement in: ` +
          "node scripts/structural-scorecard.mjs --update",
      );
    }
  }
  return messages;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const actual = measure();
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const messages = compare(actual, baseline);
  if (process.argv.includes("--update")) {
    const rose = METRICS.filter((m) => actual[m] > (baseline[m] ?? Infinity));
    if (rose.length > 0) {
      console.error(`✗ refusing to raise the baseline: ${rose.join(", ")} rose`);
      process.exit(1);
    }
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...baseline, ...actual }, null, 2)}\n`);
    console.log(`✓ scorecard.json updated: ${JSON.stringify(actual)}`);
    process.exit(0);
  }
  for (const metric of METRICS) console.log(`  ${metric}: ${actual[metric]} / ${baseline[metric]}`);
  if (messages.length > 0) {
    console.error(`✗ structural scorecard:\n${messages.map((m) => `  - ${m}`).join("\n")}`);
    process.exit(1);
  }
  console.log("✓ structural scorecard holds");
}
