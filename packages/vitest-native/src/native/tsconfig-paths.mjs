// tsconfig `paths` as string-to-string aliases for Node-side resolution.
//
// Vite 8 resolves tsconfig `paths` for imports (`resolve.tsconfigPaths`, which the
// plugin turns on for Expo projects, as Expo's Metro does). A `require('#/lib/x')` or
// `jest.requireActual('#/lib/x')` in a test resolves through Node instead, which knows
// nothing of them — so a suite whose imports of `#/…` worked failed on the same path
// required. These are the entries that resolution needs, read with TypeScript's rules:
//   - `paths` targets are relative to `baseUrl` when set, else to the tsconfig that
//     declares `paths` (TypeScript 4.1+);
//   - `paths` and `baseUrl` are each inherited through `extends`, separately (a base's
//     `baseUrl` applies to a leaf's `paths`), and a config that declares `paths`
//     replaces its base's entirely (no merging);
//   - `${configDir}` expands to the directory of the tsconfig in use (TypeScript 5.5);
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

// `${configDir}` (TypeScript 5.5) in `baseUrl` or a `paths` target names the directory
// of the tsconfig in use — the leaf of the `extends` chain, not the file declaring it.
function withConfigDir(value, leafDir) {
  return value.replaceAll("${configDir}", leafDir);
}

/**
 * The compiler options that decide `paths` resolution, merged along `extends` as
 * TypeScript does: bases in order, later ones winning, the extending file over all of
 * them. `paths` and `baseUrl` are tracked separately, each with the directory that
 * declared it, because a base may set `baseUrl` while the leaf sets `paths`. Cycles are
 * cut per chain (a stack, not a global set), so two bases sharing a third both see it.
 */
function effectiveOptions(file, leafDir, stack = []) {
  if (stack.includes(file) || stack.length > 16) return {};
  const config = readConfig(file);
  if (!config) return {};
  const dir = path.dirname(file);
  let merged = {};
  for (const spec of [config.extends ?? []].flat().filter((s) => typeof s === "string")) {
    const base = resolveExtends(withConfigDir(spec, leafDir), dir);
    if (base) merged = { ...merged, ...effectiveOptions(base, leafDir, [...stack, file]) };
  }
  const options = config.compilerOptions ?? {};
  if (typeof options.baseUrl === "string") {
    merged.baseUrl = path.resolve(dir, withConfigDir(options.baseUrl, leafDir));
  }
  if (options.paths && typeof options.paths === "object") {
    merged.paths = options.paths;
    merged.pathsDir = dir;
  }
  return merged;
}

/**
 * @param {string} projectRoot  directory holding tsconfig.json
 * @returns {{ entries: [string, string][], skipped: string[] }}
 */
export function tsconfigPathAliases(projectRoot) {
  const entries = [];
  const skipped = [];
  const leafDir = path.resolve(projectRoot);
  const found = effectiveOptions(path.join(leafDir, "tsconfig.json"), leafDir);
  if (!found.paths) return { entries, skipped };
  // Targets resolve against `baseUrl` when one is in effect, else against the config
  // that declared `paths`.
  const base = found.baseUrl ?? found.pathsDir;
  for (const [pattern, targets] of Object.entries(found.paths)) {
    const raw = Array.isArray(targets) ? targets[0] : null;
    if (typeof raw !== "string") continue;
    const target = withConfigDir(raw, leafDir);
    const patternStars = pattern.split("*").length - 1;
    const targetStars = target.split("*").length - 1;
    if (patternStars === 0 && targetStars === 0) {
      entries.push([pattern, path.resolve(base, target)]);
    } else if (
      patternStars === 1 &&
      targetStars === 1 &&
      pattern.endsWith("/*") &&
      target.endsWith("/*")
    ) {
      // `#/*` → `./src/*` becomes the prefix alias `#/` → `<abs>/src/`.
      entries.push([pattern.slice(0, -1), `${path.resolve(base, target.slice(0, -2))}/`]);
    } else {
      skipped.push(pattern);
    }
  }
  return { entries, skipped };
}
