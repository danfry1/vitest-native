/**
 * Reading Jest's `transformIgnorePatterns` allowlist, and deciding what — if
 * anything — each allowed package needs under vitest-native.
 *
 * The classic pattern is `node_modules/(?!(a|b|@scope/c)/)`: Jest transforms only
 * what the negative lookahead lets through. Real ones nest: React Native's own preset
 * ships `node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)`, and
 * a jest-expo app extends jest-expo's into
 * `node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|…)`.
 * The previous extractor matched only one level of parentheses, so that pattern
 * yielded nothing at all. This one parses the lookahead as the small regex language
 * these patterns are written in — literals, groups, alternation, `?`, `.*` — and
 * expands it into the finite set of names it allows; anything outside that language
 * is reported as unparseable rather than guessed at.
 *
 * Note what an alternative WITHOUT a trailing `/` means: `node_modules/(?!expo)`
 * lets through every package whose name STARTS with `expo` — expo-router,
 * expo-image, exponent. Those are prefixes, and are matched against the project's
 * dependencies as prefixes.
 */

export interface AllowlistEntry {
  /** The name, prefix or scope (`@expo`). */
  name: string;
  /**
   * exact — one package (`moti/`); prefix — every package whose name starts with it
   * (`expo`); scope — every package in a scope (`@expo/.*`, `@react-native/`).
   */
  kind: "exact" | "prefix" | "scope";
}

const STAR = "\0";
const MAX_EXPANSIONS = 256;

class Unparseable extends Error {}

/**
 * Expand a regex in the subset these patterns use into every string it matches,
 * with `.*` kept as STAR. Throws Unparseable outside the subset.
 */
function expand(source: string): string[] {
  let i = 0;
  const alternation = (): string[] => {
    const out = [...sequence()];
    while (source[i] === "|") {
      i++;
      out.push(...sequence());
    }
    return out;
  };
  const sequence = (): string[] => {
    let acc = [""];
    while (i < source.length && source[i] !== "|" && source[i] !== ")") {
      let atom: string[];
      const c = source[i];
      if (c === "(") {
        i++;
        if (source.startsWith("?:", i)) i += 2;
        else if (source[i] === "?") throw new Unparseable();
        atom = alternation();
        if (source[i] !== ")") throw new Unparseable();
        i++;
      } else if (c === "\\") {
        const next = source[i + 1];
        if (next === undefined || /[A-Za-z0-9]/.test(next)) throw new Unparseable();
        atom = [next];
        i += 2;
      } else if (c === ".") {
        i++;
        if (source[i] === "*") {
          i++;
          atom = [STAR];
        } else {
          // An unescaped dot is "any character" in the regex, but in a package name
          // it is only ever meant literally (`.pnpm`, `lodash.debounce`).
          atom = ["."];
        }
      } else if ("[]{}+*^$".includes(c)) {
        throw new Unparseable();
      } else {
        atom = [c];
        i++;
      }
      if (source[i] === "?") {
        i++;
        atom = ["", ...atom];
      }
      const next: string[] = [];
      for (const a of acc) for (const b of atom) next.push(a + b);
      if (next.length > MAX_EXPANSIONS) throw new Unparseable();
      acc = next;
    }
    return acc;
  };
  const result = alternation();
  if (i !== source.length) throw new Unparseable();
  return result;
}

/** The body of the first `(?!…)`, found by counting parentheses, or null. */
function lookaheadBody(pattern: string): string | null {
  const start = pattern.indexOf("(?!");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) return pattern.slice(start + 3, i);
    }
  }
  return null;
}

/** Split on `|` at depth zero. */
function topLevelAlternatives(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") {
      current += c + (body[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "|" && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

const NAME = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;
const SCOPE = /^@[a-z0-9~-][a-z0-9._~-]*$/i;
const PREFIX = /^(@[a-z0-9~-][a-z0-9._~-]*(\/[a-z0-9._~-]*)?|[a-z0-9~-][a-z0-9._~-]*)$/i;

function classify(expansion: string): AllowlistEntry | null {
  // A trailing `/.*` and a trailing `/` both end the name.
  const trimmed = expansion.replace(new RegExp(`/${STAR}$`), "/");
  if (trimmed.includes(STAR)) return null;
  if (trimmed.endsWith("/")) {
    const name = trimmed.slice(0, -1);
    if (SCOPE.test(name)) return { name, kind: "scope" };
    return NAME.test(name) ? { name, kind: "exact" } : null;
  }
  // A prefix may stop anywhere in a name, including inside the scope
  // (`@react-native` lets through @react-native/* and @react-native-community/*).
  return PREFIX.test(trimmed) ? { name: trimmed, kind: "prefix" } : null;
}

/**
 * The names a `transformIgnorePatterns` entry allows, and the alternatives that
 * could not be read. Directory names that are not packages (pnpm's `.pnpm` store)
 * are dropped.
 */
export function extractAllowlistPackages(pattern: string): {
  entries: AllowlistEntry[];
  unparseable: string[];
} {
  const body = lookaheadBody(pattern);
  if (body === null) return { entries: [], unparseable: [] };
  const entries: AllowlistEntry[] = [];
  const unparseable: string[] = [];
  for (const alternative of topLevelAlternatives(body)) {
    let expansions: string[];
    try {
      expansions = expand(alternative);
    } catch {
      unparseable.push(alternative);
      continue;
    }
    const classified = expansions
      .filter((e) => !e.startsWith("."))
      .map((e) => [e, classify(e)] as const);
    if (classified.some(([, c]) => c === null)) {
      unparseable.push(alternative);
      continue;
    }
    for (const [, entry] of classified) {
      if (!entries.some((e) => e.name === entry!.name && e.kind === entry!.kind)) {
        entries.push(entry!);
      }
    }
  }
  return { entries, unparseable };
}

/** Whether a dependency name falls under an allowlist entry. */
export function allows(entry: AllowlistEntry, pkg: string): boolean {
  if (entry.kind === "exact") return pkg === entry.name;
  if (entry.kind === "scope") return pkg.startsWith(`${entry.name}/`);
  return pkg.startsWith(entry.name);
}
