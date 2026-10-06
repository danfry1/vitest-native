/**
 * Reading Jest's `transformIgnorePatterns` allowlist,
 * `node_modules/(?!(a|b|@scope/c)/)`. Real ones nest — React Native's own preset
 * ships `node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)` — so
 * the lookahead is found by counting parentheses and expanded with the shared
 * regex-subset expander. An alternative WITHOUT a trailing `/` is a name PREFIX:
 * `(?!expo)` lets through expo-router and exponent too.
 */
import { STAR, tryExpand } from "./regex-subset.js";

export interface AllowlistEntry {
  /** The name, prefix or scope (`@expo`). */
  name: string;
  /** exact (`moti/`), prefix (`expo`), or scope (`@expo/.*`, `@react-native/`). */
  kind: "exact" | "prefix" | "scope";
}

/** The body of the first `(?!…)`, or null. */
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
// A prefix may stop inside the scope: `@react-native` also lets through @react-native-community/*.
const PREFIX = /^(@[a-z0-9~-][a-z0-9._~-]*(\/[a-z0-9._~-]*)?|[a-z0-9~-][a-z0-9._~-]*)$/i;

function classify(expansion: string): AllowlistEntry | null {
  const trimmed = expansion.replace(new RegExp(`/${STAR}$`), "/");
  if (trimmed.includes(STAR)) return null;
  if (trimmed.endsWith("/")) {
    const name = trimmed.slice(0, -1);
    if (SCOPE.test(name)) return { name, kind: "scope" };
    return NAME.test(name) ? { name, kind: "exact" } : null;
  }
  return PREFIX.test(trimmed) ? { name: trimmed, kind: "prefix" } : null;
}

/** The names an allowlist pattern lets through, and the alternatives it could not read. */
export function extractAllowlistPackages(pattern: string): {
  entries: AllowlistEntry[];
  unparseable: string[];
} {
  const body = lookaheadBody(pattern);
  if (body === null) return { entries: [], unparseable: [] };
  const entries: AllowlistEntry[] = [];
  const unparseable: string[] = [];
  for (const alternative of topLevelAlternatives(body)) {
    // pnpm's `.pnpm` store directory is not a package.
    const classified = tryExpand(alternative, true)
      ?.filter((e) => !e.startsWith("."))
      .map(classify);
    if (!classified || classified.some((c) => c === null)) {
      unparseable.push(alternative);
      continue;
    }
    for (const entry of classified as AllowlistEntry[]) {
      if (!entries.some((e) => e.name === entry.name && e.kind === entry.kind)) entries.push(entry);
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
