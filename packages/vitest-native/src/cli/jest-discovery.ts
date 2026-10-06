/**
 * Which files Jest treats as tests, said to Vitest.
 *
 * Jest's test set is its EFFECTIVE config — the preset's keys under the user's, Jest's
 * defaults under both — narrowed by testPathIgnorePatterns, modulePathIgnorePatterns
 * and moduleFileExtensions. Translating only an explicit testMatch left a jest-expo
 * app on Vitest's default include: about twice Jest's files, some of Jest's missed.
 * Sources: jest-config 30 (`setupPreset`, `normalize`, `Defaults`), jest-util
 * `globsToMatcher`, @jest/core `SearchSource`, jest-runtime's haste map; Vitest
 * collects with tinyglobby (`dot: true`, `ignore: exclude`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { installedMajor } from "./manifest.js";
import { STAR, tryExpand } from "./regex-subset.js";

export interface JestDiscoveryOptions {
  testMatch?: string[];
  testRegex?: string | string[];
  testPathIgnorePatterns?: string[];
  modulePathIgnorePatterns?: string[];
  moduleFileExtensions?: string[];
  roots?: string[];
}

/** jest-config `Defaults` for the discovery keys, per major (https://jestjs.io/docs/configuration). */
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

/** The installed Jest's major (29 or 30), or null when Jest is not installed. */
export function jestMajor(root: string): 29 | 30 | null {
  const major = installedMajor(root, "jest") ?? installedMajor(root, "jest-config");
  return major === null ? null : major <= 29 ? 29 : 30;
}

/**
 * Load a preset as jest-config's `setupPreset` does: a relative or absolute path is
 * resolved as written, anything else as `<name>/jest-preset`, trying the extensions
 * .json, .js, .cjs in that order (.mjs cannot be loaded synchronously). Loading
 * executes the preset, as Jest does.
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
  // Node's resolver tries .js before .json; Jest's tries .json first.
  const candidates = [".json", ".js", ".cjs"].includes(path.extname(base))
    ? [base]
    : [`${base}.json`, `${base}.js`, `${base}.cjs`, base];
  let file: string | undefined;
  for (const candidate of candidates) {
    try {
      file = req.resolve(candidate);
      break;
    } catch {
      // next
    }
  }
  if (!file) return { error: `cannot resolve '${base}' from ${root}` };
  // Presets may read NODE_ENV while loading (jest-expo resolves Babel options); Jest
  // has set it to 'test' by then.
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
 * Convert a Jest `testPathIgnorePatterns` / `modulePathIgnorePatterns` regex into
 * `exclude` globs selecting the same files, or null when that cannot be done exactly.
 *
 * Jest tests each pattern unanchored against the ABSOLUTE path (@jest/core
 * SearchSource; jest-runtime's haste-map `ignorePattern`); Vitest matches `exclude`
 * against root-relative paths. So `<rootDir>/x` anchors at the root, anything else may
 * start mid-segment (`bskylink/.*` also ignores `notbskylink/`, hence `**\/*`), `/.*\/`
 * spans whole segments (`*\/**`), a trailing `/`, `/.*` or `.*` leaves the rest free,
 * a pattern ending mid-segment covers a file and a directory, and `$` is left for a human.
 * Jest substitutes `<rootDir>` unescaped; it is read here as the directory it names.
 * A match starting above the root has no relative form and is not attempted.
 */
export function ignorePatternToGlobs(pattern: string): string[] | null {
  let rest = pattern;
  let anchored = false;
  if (rest.startsWith("<rootDir>")) {
    anchored = true;
    rest = rest.slice("<rootDir>".length);
    if (!rest.startsWith("/") || rest === "/") return null;
  }
  // A trailing `$` preceded by an even number of backslashes is an anchor.
  const endAnchored = /(^|[^\\])(\\\\)*\$$/.test(rest);
  if (endAnchored) rest = rest.slice(0, -1);
  const expansions = tryExpand(rest, false);
  if (!expansions) return null;
  const globs: string[] = [];
  for (const expansion of expansions) {
    const converted = expansionToGlobs(expansion, anchored, endAnchored);
    if (!converted) return null;
    globs.push(...converted);
  }
  return [...new Set(globs)];
}

function expansionToGlobs(
  expansion: string,
  anchored: boolean,
  endAnchored: boolean,
): string[] | null {
  let s = expansion;
  // Characters picomatch reads as syntax (classes, braces, extglob parens, negation,
  // escapes) cannot be emitted as literals.
  if (/[*?[\]{}()!\\]/.test(s.replaceAll(STAR, ""))) return null;
  if (s.endsWith(STAR)) {
    s = s.slice(0, -1);
    endAnchored = false;
  }
  if (!anchored) s = s.replace(new RegExp(`^${STAR}+`), "");
  if (s === "" || (anchored && s.startsWith(`/${STAR}`))) return null;
  // A file path never ends in `/`, so `x/$` excludes nothing. Any other `$` cannot be
  // said as an exclude glob: tinyglobby prunes a DIRECTORY an ignore glob matches,
  // so `**/*.snap` would also drop everything inside a directory named `x.snap`.
  if (endAnchored) return s.endsWith("/") ? [] : null;
  const parts = s.split(`/${STAR}/`);
  if (parts.some((part) => part.includes(STAR) || part === "")) return null;
  let glob = parts.join("/*/**/");
  if (anchored) glob = glob.slice(1);
  else glob = glob.startsWith("/") ? `**/${glob.slice(1)}` : `**/*${glob}`;
  if (glob.endsWith("/")) return [`${glob}**`];
  return [`${glob}*`, `${glob}*/**`];
}

const TEST_FILE_EXTENSIONS = ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"];

/** The last-segment extensions Jest's haste map crawls (`ios.ts` adds nothing beyond `ts`). */
function visibleExtensions(moduleFileExtensions: string[]): string[] {
  return moduleFileExtensions.filter((ext) => !ext.includes("."));
}

/**
 * An exclude glob for the script extensions Jest cannot see: its haste map crawls
 * only `moduleFileExtensions` (jest-runtime passes them as `extensions`).
 */
export function extensionExclude(moduleFileExtensions: string[]): string | null {
  const visible = new Set(visibleExtensions(moduleFileExtensions));
  const hidden = TEST_FILE_EXTENSIONS.filter((ext) => !visible.has(ext));
  if (hidden.length === 0) return null;
  return hidden.length === 1 ? `**/*.${hidden[0]}` : `**/*.{${hidden.join(",")}}`;
}

export interface DiscoveryResult {
  /** `test.include`, or null to keep Vitest's default. */
  include: string[] | null;
  /** Extra `test.exclude` globs, appended after `configDefaults.exclude`. */
  exclude: string[];
  automatic: string[];
  attention: string[];
}

/**
 * Jest's effective discovery settings, translated. `preset` is the loaded preset's
 * config (null when none). Merged as `setupPreset` does — the user's keys win,
 * `modulePathIgnorePatterns` concatenates — and defaulted as `normalize` does.
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
  const defaultsNote = major === null ? "; Jest is not installed, so Jest 30's" : "";
  const extensions = pick("moduleFileExtensions");
  const moduleFileExtensions = extensions.value ?? defaults.moduleFileExtensions;

  const regexes = [pick("testRegex").value ?? []].flat().filter(Boolean);
  const exclude: string[] = [];
  let include: string[] | null = null;

  if (regexes.length > 0) {
    attention.push(
      `testRegex ${JSON.stringify(regexes)} — Vitest selects test files by glob only; rewrite it as ` +
        `test.include globs (the suggested config keeps Vitest's default include until then).`,
    );
  } else {
    const match = pick("testMatch");
    const positive: string[] = [];
    const negated: string[] = [];
    let positiveAfterNegation = false;
    for (const raw of match.value ?? defaults.testMatch) {
      const isNegated = raw.startsWith("!");
      const glob = (isNegated ? raw.slice(1) : raw).replace(/^<rootDir>\//, "");
      // Jest matches testMatch against ABSOLUTE paths, so a glob that neither starts
      // with `**` nor names the root matches nothing there; Vitest would match it
      // against relative paths. Not carried over.
      if (path.isAbsolute(glob)) {
        attention.push(`testMatch '${raw}' — an absolute glob; map it to test.include by hand.`);
        continue;
      }
      if (!glob.startsWith("**") && raw.replace(/^!/, "") === glob) {
        attention.push(
          `testMatch '${raw}' — Jest compares testMatch with absolute paths, so this glob matched ` +
            `nothing; not carried over (prefix it with **/ if it was meant to match).`,
        );
        continue;
      }
      if (isNegated) negated.push(glob);
      else {
        if (negated.length) positiveAfterNegation = true;
        positive.push(glob);
      }
    }
    // jest-util's globsToMatcher: a negation removes what earlier globs kept, a later
    // positive glob can keep it again, and an all-negated list keeps every file the
    // negations do not remove. tinyglobby takes negations as ignores.
    if (positiveAfterNegation) {
      attention.push(
        `testMatch ${JSON.stringify(match.value)} — a positive glob after a negation re-includes what the ` +
          `negation removed; the negations are applied to all files here, so review the result.`,
      );
    }
    exclude.push(...negated);
    if (positive.length === 0 && negated.length > 0) {
      const exts = visibleExtensions(moduleFileExtensions);
      positive.push(exts.length === 1 ? `**/*.${exts[0]}` : `**/*.{${exts.join(",")}}`);
      attention.push(
        `testMatch has only negated globs, so Jest treated every file it crawls (${exts.join(", ")}) ` +
          `that they do not remove as a test; mapped the same way — review it.`,
      );
    }
    const roots = (pick("roots").value ?? defaults.roots).map((r) =>
      r.replace(/^<rootDir>\/?/, "").replace(/\/$/, ""),
    );
    if (roots.every((r) => r === "")) {
      include = positive;
    } else {
      // `roots` limits where Jest looks: `**/` globs apply below each root.
      include = [
        ...new Set(
          roots.flatMap((r) =>
            positive.map((g) => (r === "" ? g : g.startsWith("**/") ? `${r}/${g}` : g)),
          ),
        ),
      ];
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
    // setupPreset concatenates modulePathIgnorePatterns when both sides set it.
    const patterns =
      key === "modulePathIgnorePatterns" && fromOptions && fromPreset
        ? [...fromPreset, ...fromOptions]
        : (fromOptions ?? fromPreset ?? defaults[key]);
    const extra =
      key === "modulePathIgnorePatterns"
        ? " Jest also hid these paths from module resolution; Vite has no equivalent, which only matters if a test imported a module from one."
        : "";
    for (const pattern of patterns) {
      // Jest's default; configDefaults.exclude (spread first) has `**/node_modules/**`.
      if (pattern === "/node_modules/") continue;
      const globs = ignorePatternToGlobs(pattern);
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

  const hidden = extensionExclude(moduleFileExtensions);
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

/**
 * Split a shell command into commands of words. Quotes group and are removed
 * (`--flag="a b"` is the word `--flag=a b`), a backslash escapes outside single
 * quotes, and `&&`, `||`, `;` and `|` separate commands only outside quotes.
 */
export function shellCommands(command: string): string[][] {
  const commands: string[][] = [[]];
  let word: string | null = null;
  const end = () => {
    if (word !== null) commands[commands.length - 1].push(word);
    word = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'" || c === '"') {
      const close = command.indexOf(c, i + 1);
      const stop = close === -1 ? command.length : close;
      let quoted = command.slice(i + 1, stop);
      if (c === '"') quoted = quoted.replace(/\\(["\\$`])/g, "$1");
      word = (word ?? "") + quoted;
      i = stop;
    } else if (c === "\\") {
      word = (word ?? "") + (command[i + 1] ?? "");
      i++;
    } else if (/\s/.test(c)) {
      end();
    } else if (c === ";" || c === "|" || (c === "&" && command[i + 1] === "&")) {
      end();
      if (command[i + 1] === c) i++;
      commands.push([]);
    } else {
      word = (word ?? "") + c;
    }
  }
  end();
  return commands.filter((words) => words.length > 0);
}

export interface JestScriptFlags {
  script: string;
  /** camelCase flag → value (true for a bare flag). */
  flags: Map<string, string | true>;
  /** Positional arguments (test path patterns). */
  positional: string[];
}

/**
 * The Jest flags a package.json script passes, or null when it does not run Jest.
 * Only the command invoking `jest` (or its bin script) is read. Jest accepts
 * `--test-timeout` as well as `--testTimeout` (yargs), so names are camel-cased.
 */
export function parseJestScript(script: string, command: string): JestScriptFlags | null {
  for (const tokens of shellCommands(command)) {
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
        flags.set(name, args[++i]); // optional count
      } else {
        flags.set(name, true);
      }
    }
    return { script, flags, positional };
  }
  return null;
}

/** A boolean flag's value: bare or `=true` is true, `=false` false, else undefined. */
export function booleanFlag(value: string | true | undefined): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
