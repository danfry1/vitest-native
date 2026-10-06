/**
 * Which files Jest treats as tests, and how `migrate` says the same thing to Vitest.
 *
 * `migrate` used to translate only an explicit `testMatch` and otherwise left
 * Vitest's own default include in place. Jest's test set is not the config's keys
 * but the EFFECTIVE config — a preset's keys under the user's, with Jest's defaults
 * underneath — narrowed by `testPathIgnorePatterns`, `modulePathIgnorePatterns` and
 * `moduleFileExtensions`. A jest-expo project measured the gap: Jest ran 105 suites,
 * the generated config collected 213 files and missed 9 of Jest's, because
 * jest-expo's `testMatch` (`**\/__tests__/**\/*test.[jt]s?(x)`, no dot) was dropped,
 * its ignore patterns were reported as "no equivalent needed", and Vitest's
 * extension set picked up `node:test` scripts (`*.test.mjs`) Jest never saw.
 *
 * Everything here follows the Jest source that decides it (jest-config 30's
 * `setupPreset` and `normalize`, jest-util's `globsToMatcher`, @jest/core's
 * `SearchSource`, jest-runtime's haste map) and what Vitest does with the result
 * (`globProjectFiles`: tinyglobby with `dot: true`, `ignore: exclude`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

export interface JestDiscoveryOptions {
  testMatch?: string[];
  testRegex?: string | string[];
  testPathIgnorePatterns?: string[];
  modulePathIgnorePatterns?: string[];
  moduleFileExtensions?: string[];
  roots?: string[];
}

/**
 * Jest's defaults for the keys that decide discovery, from jest-config's
 * `Defaults` (https://jestjs.io/docs/configuration). Jest 30 widened both lists to
 * the `.mts`/`.cts` (and, in testMatch, `.mjs`/`.cjs`) extensions; Jest 29's are
 * kept because a project migrating from 29 ran exactly that set.
 */
const JEST_DEFAULTS: Record<29 | 30, Required<Omit<JestDiscoveryOptions, "testRegex">>> = {
  29: {
    testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[tj]s?(x)"],
    testPathIgnorePatterns: ["/node_modules/"],
    modulePathIgnorePatterns: [],
    moduleFileExtensions: ["js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "node"],
    roots: ["<rootDir>"],
  },
  30: {
    testMatch: ["**/__tests__/**/*.?([mc])[jt]s?(x)", "**/?(*.)+(spec|test).?([mc])[jt]s?(x)"],
    testPathIgnorePatterns: ["/node_modules/"],
    modulePathIgnorePatterns: [],
    moduleFileExtensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node"],
    roots: ["<rootDir>"],
  },
};

/** The installed Jest's major version (29 or 30), or null when Jest is not installed. */
export function jestMajor(root: string): 29 | 30 | null {
  const req = createRequire(path.join(root, "package.json"));
  for (const pkg of ["jest", "jest-config"]) {
    try {
      const version = (req(`${pkg}/package.json`) as { version?: string }).version ?? "";
      return Number(version.split(".")[0]) <= 29 ? 29 : 30;
    } catch {
      // not installed under this name
    }
  }
  return null;
}

/**
 * Load a Jest preset the way jest-config's `setupPreset` does: a relative or
 * absolute path is used as written, anything else is `<name>/jest-preset` resolved
 * from the root directory with the extensions .json, .js, .cjs (and .mjs, which a
 * synchronous loader cannot read). Loading executes the preset, exactly as Jest
 * does; `migrate` already executes a jest.config.js for the same reason.
 */
export function loadJestPreset(
  root: string,
  preset: string,
): { config: JestDiscoveryOptions & Record<string, unknown>; file: string } | { error: string } {
  const req = createRequire(path.join(root, "package.json"));
  const presetPath = preset.replace(/^<rootDir>/, root);
  const base =
    presetPath.startsWith(".") || path.isAbsolute(presetPath)
      ? path.resolve(root, presetPath)
      : `${presetPath}/jest-preset`;
  let file: string | undefined;
  for (const ext of ["", ".json", ".js", ".cjs"]) {
    try {
      file = req.resolve(base + ext);
      break;
    } catch {
      // try the next extension
    }
  }
  if (!file) return { error: `cannot resolve '${base}' from ${root}` };
  // Babel- and Metro-flavoured presets read NODE_ENV while they load (jest-expo
  // resolves its Babel options at require time); Jest sets it to 'test' before
  // reading any config, so do the same for the duration of the load.
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV ??= "test";
  try {
    const loaded = file.endsWith(".json")
      ? (JSON.parse(fs.readFileSync(file, "utf8")) as unknown)
      : (req(file) as unknown);
    const config =
      loaded && typeof loaded === "object" && "default" in loaded
        ? (loaded as { default: unknown }).default
        : loaded;
    if (!config || typeof config !== "object") return { error: `${file} exports no object` };
    return { config: config as JestDiscoveryOptions & Record<string, unknown>, file };
  } catch (error) {
    return { error: `${file} failed to load: ${(error as Error).message.split("\n")[0]}` };
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
}

/**
 * Convert one Jest `testPathIgnorePatterns` / `modulePathIgnorePatterns` regex into
 * Vitest `exclude` globs that select the same files, or null when the regex is not
 * one of the shapes this can translate EXACTLY.
 *
 * Jest tests each pattern, unanchored, against the ABSOLUTE path
 * (`new RegExp(patterns.join('|')).test(path)` in @jest/core's SearchSource, and the
 * haste map's `ignorePattern` for modulePathIgnorePatterns in jest-runtime), with
 * `<rootDir>` replaced by the root directory. Vitest's `exclude` globs are matched
 * against paths relative to the root. Translated:
 *
 * - `<rootDir>/x` anchors the match at the root; anything else may start anywhere,
 *   including inside a path segment — `bskylink/.*` also ignores `notbskylink/` —
 *   which is what the leading `**\/*` reproduces.
 * - `/.*\/` between two literals is one or more whole segments: `*\/**`.
 * - a trailing `/`, `/.*` or `.*` leaves the rest of the path free; a trailing `$`
 *   pins the end; a pattern ending mid-segment covers both the file (`x*`) and a
 *   directory of that name (`x*\/**`).
 *
 * Character classes, groups, alternation and other quantifiers have no exact glob
 * form, so they are left for a human rather than approximated. A match that begins
 * ABOVE the root (a pattern naming a directory the project itself sits in) has no
 * relative-path equivalent either; that is not representable and not attempted.
 */
export function ignorePatternToGlobs(pattern: string): string[] | null {
  let rest = pattern;
  let anchored = false;
  if (rest.startsWith("<rootDir>")) {
    anchored = true;
    rest = rest.slice("<rootDir>".length);
    if (!rest.startsWith("/") || rest === "/") return null;
  }
  let endAnchored = false;
  if (rest.endsWith("$") && !rest.endsWith("\\$")) {
    endAnchored = true;
    rest = rest.slice(0, -1);
  }
  // Tokenize: literal characters, and `.*` as STAR. "\0" marks STAR.
  let s = "";
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "\\") {
      const next = rest[i + 1];
      // \d, \w, \b and friends are classes, not escaped literals.
      if (next === undefined || /[A-Za-z0-9]/.test(next)) return null;
      s += next;
      i++;
    } else if (c === "." && rest[i + 1] === "*") {
      s += "\0";
      i++;
    } else if ("^$()[]{}|+?*.".includes(c)) {
      return null;
    } else {
      s += c;
    }
  }
  // Characters a glob would read as syntax cannot be emitted as literals.
  if (/[*?[\]{}]/.test(s.replace(/\0/g, ""))) return null;
  // A trailing `.*` leaves the end free, exactly like no `.*` at all.
  if (s.endsWith("\0")) {
    s = s.slice(0, -1);
    endAnchored = false;
  }
  if (!anchored) s = s.replace(/^\0+/, "");
  if (anchored && s.startsWith("/\0")) return null;
  // Every remaining `.*` must span whole segments: `/.*/`.
  const parts = s.split("/\0/");
  if (parts.some((part) => part.includes("\0") || part === "")) return null;
  let glob = parts.join("/*/**/");
  if (anchored) glob = glob.slice(1);
  else glob = glob.startsWith("/") ? `**/${glob.slice(1)}` : `**/*${glob}`;
  if (glob.endsWith("/")) return [`${glob}**`];
  if (endAnchored) return [glob];
  return [`${glob}*`, `${glob}*/**`];
}

/** File extensions Jest or Vitest could take a test file to have. */
const TEST_FILE_EXTENSIONS = ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"];

/**
 * An exclude glob for the script extensions Jest cannot see.
 *
 * Jest's haste map only crawls files whose extension is in `moduleFileExtensions`
 * (jest-runtime passes it as the map's `extensions`, compared against the LAST
 * extension, so jest-expo's `ios.ts` entries add nothing beyond `ts`). A file outside
 * that set is never a test, whatever the patterns say.
 */
export function extensionExclude(moduleFileExtensions: string[]): string | null {
  const visible = new Set(moduleFileExtensions.filter((ext) => !ext.includes(".")));
  const hidden = TEST_FILE_EXTENSIONS.filter((ext) => !visible.has(ext));
  if (hidden.length === 0) return null;
  return hidden.length === 1 ? `**/*.${hidden[0]}` : `**/*.{${hidden.join(",")}}`;
}

export interface DiscoveryResult {
  /** `test.include` entries (JSON-ready strings), or null to keep Vitest's default. */
  include: string[] | null;
  /** Additional `test.exclude` globs, appended after `configDefaults.exclude`. */
  exclude: string[];
  automatic: string[];
  attention: string[];
}

/**
 * Jest's effective discovery settings, translated.
 *
 * `options` is the user's config; `preset` the loaded preset's (null when there is
 * none or it could not be loaded). Merged as jest-config's `setupPreset` does — the
 * user's keys win, `modulePathIgnorePatterns` concatenates — then defaulted as
 * `normalize` does: an explicit `testRegex` empties `testMatch`.
 */
export function translateDiscovery(
  options: JestDiscoveryOptions,
  preset: JestDiscoveryOptions | null,
  major: 29 | 30 | null,
): DiscoveryResult {
  const defaults = JEST_DEFAULTS[major ?? 30];
  const automatic: string[] = [];
  const attention: string[] = [];
  const pick = <K extends keyof JestDiscoveryOptions>(
    key: K,
  ): { value: JestDiscoveryOptions[K]; from: string } => {
    if (options[key] !== undefined) return { value: options[key], from: "from the config" };
    if (preset?.[key] !== undefined) return { value: preset[key], from: "from the preset" };
    return { value: undefined, from: `Jest ${major ?? 30}'s default` };
  };
  const defaultsNote = major === null ? " (Jest is not installed; Jest 30's defaults assumed)" : "";

  const regex = pick("testRegex");
  const regexes = [regex.value ?? []].flat().filter(Boolean);
  const exclude: string[] = [];
  let include: string[] | null = null;

  if (regexes.length > 0) {
    attention.push(
      `testRegex ${JSON.stringify(regexes)} — Vitest selects test files by glob only; rewrite it as ` +
        `test.include globs (the suggested config keeps Vitest's default include until then).`,
    );
  } else {
    const match = pick("testMatch");
    const globs = (match.value ?? defaults.testMatch).map((g) => g.replace(/^<rootDir>\//, ""));
    // jest-util's globsToMatcher treats `!glob` as a negation; tinyglobby takes
    // negations as ignores, so they move to exclude.
    const positive = globs.filter((g) => !g.startsWith("!"));
    exclude.push(...globs.filter((g) => g.startsWith("!")).map((g) => g.slice(1)));
    const roots = (pick("roots").value ?? defaults.roots).map((r) =>
      r.replace(/^<rootDir>\/?/, "").replace(/\/$/, ""),
    );
    if (roots.every((r) => r === "")) {
      include = positive;
    } else {
      // `roots` limits where Jest looks. Globs that start with `**/` apply below each
      // root; any other glob already names its own directory.
      include = roots.flatMap((r) =>
        positive.map((g) => (r === "" ? g : g.startsWith("**/") ? `${r}/${g}` : g)),
      );
      include = [...new Set(include)];
      automatic.push(`roots ${JSON.stringify(roots)} → test.include scoped to those directories.`);
    }
    automatic.push(
      `testMatch (${match.from}${match.value ? "" : defaultsNote}) → test.include ${JSON.stringify(include)}, ` +
        `so Jest's patterns, not Vitest's default include, decide which files are tests.`,
    );
  }

  for (const key of ["testPathIgnorePatterns", "modulePathIgnorePatterns"] as const) {
    const fromOptions = options[key];
    const fromPreset = preset?.[key];
    // setupPreset concatenates modulePathIgnorePatterns when BOTH sides set it;
    // for every other key the user's value replaces the preset's.
    const patterns =
      key === "modulePathIgnorePatterns" && fromOptions && fromPreset
        ? [...fromPreset, ...fromOptions]
        : (fromOptions ?? fromPreset ?? defaults[key]);
    for (const pattern of patterns) {
      // Jest's own default — Vitest's default exclude already carries
      // `**/node_modules/**` (vitest.dev/config/exclude), spread in first.
      if (pattern === "/node_modules/") continue;
      const globs = ignorePatternToGlobs(pattern);
      const extra =
        key === "modulePathIgnorePatterns"
          ? " Jest also hid these paths from module resolution; Vite has no equivalent, which only matters if a test imported a module from one."
          : "";
      if (globs) {
        exclude.push(...globs);
        automatic.push(`${key} '${pattern}' → test.exclude ${JSON.stringify(globs)}.${extra}`);
      } else {
        attention.push(
          `${key} '${pattern}' — a regex with no exact glob form; add the equivalent test.exclude glob by hand ` +
            `(Jest skipped every test whose path matched it).${extra}`,
        );
      }
    }
  }

  const extensions = pick("moduleFileExtensions");
  const hidden = extensionExclude(extensions.value ?? defaults.moduleFileExtensions);
  if (hidden) {
    exclude.push(hidden);
    automatic.push(
      `moduleFileExtensions (${extensions.from}) → test.exclude '${hidden}': ` +
        `Jest never sees files with other extensions, so they are not tests there.`,
    );
  }

  return { include, exclude: [...new Set(exclude)], automatic, attention };
}

// ---------------------------------------------------------------------------
// package.json scripts
// ---------------------------------------------------------------------------

/** Jest CLI flags that take a value (https://jestjs.io/docs/cli). */
const VALUED_FLAGS = new Set([
  "testTimeout",
  "maxWorkers",
  "w",
  "config",
  "c",
  "testNamePattern",
  "t",
  "testPathPatterns",
  "testPathPattern",
  "testPathIgnorePatterns",
  "shard",
  "seed",
  "reporters",
  "outputFile",
  "rootDir",
  "roots",
  "selectProjects",
  "maxConcurrency",
  "testEnvironment",
  "env",
  "coverageDirectory",
  "collectCoverageFrom",
  "changedSince",
]);

/** Split a shell command into words, honouring simple quotes. Not a shell. */
function words(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of command.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export interface JestScriptFlags {
  /** The script the flags came from. */
  script: string;
  /** Flag name (camelCase, as Jest's docs spell it) → value (true for a bare flag). */
  flags: Map<string, string | true>;
  /** Positional arguments (test path patterns). */
  positional: string[];
}

/**
 * The Jest flags a package.json script passes, or null when it does not run Jest.
 *
 * Only the command that invokes `jest` (or its bin script) is read — `NODE_ENV=test
 * jest --forceExit` and `yarn jest -w 2 && tsc` both work; anything after `&&`,
 * `||`, `;` or `|` is another command. Jest's CLI accepts both `--testTimeout` and
 * `--test-timeout` (yargs camel-case expansion), so kebab-case is normalised.
 */
export function parseJestScript(script: string, command: string): JestScriptFlags | null {
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const tokens = words(segment);
    const at = tokens.findIndex((t) => /(^|\/)jest(\.js)?$/.test(t));
    if (at === -1) continue;
    const flags = new Map<string, string | true>();
    const positional: string[] = [];
    const args = tokens.slice(at + 1);
    for (let i = 0; i < args.length; i++) {
      const token = args[i];
      if (!token.startsWith("-")) {
        positional.push(token);
        continue;
      }
      const [rawName, inline] = token.replace(/^--?/, "").split(/=(.*)/s, 2);
      const name = rawName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      if (inline !== undefined) {
        flags.set(name, inline);
      } else if (VALUED_FLAGS.has(name) && args[i + 1] !== undefined) {
        flags.set(name, args[++i]);
      } else if (name === "bail" && /^\d+$/.test(args[i + 1] ?? "")) {
        // --bail takes an optional count.
        flags.set(name, args[++i]);
      } else {
        flags.set(name, true);
      }
    }
    return { script, flags, positional };
  }
  return null;
}
