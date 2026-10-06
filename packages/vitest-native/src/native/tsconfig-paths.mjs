// tsconfig `paths` as string-to-string aliases for Node-side resolution.
//
// Vite 8 resolves tsconfig `paths` for imports (`resolve.tsconfigPaths`, which the
// plugin turns on for Expo projects, as Expo's Metro does). A `require('#/lib/x')` or
// `jest.requireActual('#/lib/x')` in a test resolves through Node instead, which knows
// nothing of them — so a suite whose imports of `#/…` worked failed on the same path
// required. These are the entries that resolution needs, read with TypeScript's rules:
//   - `paths` targets are relative to `baseUrl` when set, else to the tsconfig that
//     declares `paths` (TypeScript 4.1+);
//   - `paths` and `baseUrl` are inherited through `extends`, and a config that declares
//     `paths` replaces its base's entirely (no merging);
//   - only the first target of each entry is used, as resolution tries it first.
// A pattern TypeScript allows but a prefix alias cannot express (a `*` anywhere but the
// end, or a target without the matching `*`) is reported as skipped, not guessed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** JSON with comments and trailing commas (tsconfig's format) → JSON. */
export function stripJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += c;
    }
  }
  return dropTrailingCommas(out);
}

// A comma outside a string that only whitespace separates from `}` or `]`.
function dropTrailingCommas(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

function readConfig(file) {
  try {
    return JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function resolveExtends(spec, fromDir) {
  if (spec.startsWith(".") || path.isAbsolute(spec)) {
    const file = path.resolve(fromDir, spec);
    return fs.existsSync(file) ? file : fs.existsSync(`${file}.json`) ? `${file}.json` : null;
  }
  const req = createRequire(path.join(fromDir, "package.json"));
  for (const candidate of [spec, `${spec}.json`, `${spec}/tsconfig.json`]) {
    try {
      return req.resolve(candidate);
    } catch {
      // Try the next form TypeScript accepts.
    }
  }
  return null;
}

/** The effective `paths` (with the directory they are relative to), or null. */
function effectivePaths(file, seen = new Set()) {
  if (seen.has(file) || seen.size > 16) return null;
  seen.add(file);
  const config = readConfig(file);
  if (!config) return null;
  const dir = path.dirname(file);
  const options = config.compilerOptions ?? {};
  const bases = [config.extends ?? []].flat().filter((s) => typeof s === "string");
  // Later entries of an `extends` array win, as TypeScript applies them in order.
  let inherited = null;
  for (const spec of bases) {
    const base = resolveExtends(spec, dir);
    const hit = base ? effectivePaths(base, seen) : null;
    if (hit) inherited = hit;
  }
  const baseUrl = typeof options.baseUrl === "string" ? path.resolve(dir, options.baseUrl) : null;
  if (options.paths && typeof options.paths === "object") {
    return { paths: options.paths, base: baseUrl ?? inherited?.baseUrl ?? dir, baseUrl };
  }
  if (inherited && baseUrl) return { ...inherited, base: baseUrl, baseUrl };
  return inherited;
}

/**
 * @param {string} projectRoot  directory holding tsconfig.json
 * @returns {{ entries: [string, string][], skipped: string[] }}
 */
export function tsconfigPathAliases(projectRoot) {
  const entries = [];
  const skipped = [];
  const found = effectivePaths(path.join(projectRoot, "tsconfig.json"));
  if (!found) return { entries, skipped };
  for (const [pattern, targets] of Object.entries(found.paths)) {
    const target = Array.isArray(targets) ? targets[0] : null;
    if (typeof target !== "string") continue;
    const patternStars = pattern.split("*").length - 1;
    const targetStars = target.split("*").length - 1;
    if (patternStars === 0 && targetStars === 0) {
      entries.push([pattern, path.resolve(found.base, target)]);
    } else if (
      patternStars === 1 &&
      targetStars === 1 &&
      pattern.endsWith("/*") &&
      target.endsWith("/*")
    ) {
      // `#/*` → `./src/*` becomes the prefix alias `#/` → `<abs>/src/`.
      entries.push([pattern.slice(0, -1), `${path.resolve(found.base, target.slice(0, -2))}/`]);
    } else {
      skipped.push(pattern);
    }
  }
  return { entries, skipped };
}
