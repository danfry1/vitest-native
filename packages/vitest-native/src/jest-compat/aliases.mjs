// `resolve.alias` for `jest.requireActual` / `jest.requireMock`.
//
// Vite applies the project's aliases to imports, but `requireActual` resolves through
// Node, which knows nothing of them — so `jest.requireActual('@/services/api')` threw
// "Cannot find module" in a suite whose imports of the same path worked. The plugin
// knows the aliases at config time and hands the serializable ones to the compat setup;
// these helpers are the two halves of that hand-off.
import path from "node:path";

/**
 * The string-to-string entries of a Vite `resolve.alias`, in either of its shapes, with
 * relative replacements made absolute against `root`. Regex `find`s and custom
 * resolvers cannot cross into the test worker, so they are listed as `skipped` for the
 * error that explains a miss.
 *
 * @param {unknown} alias  `resolve.alias`: an object, or an array of `{ find, replacement }`
 * @param {string} root    project root, for relative replacements
 * @returns {{ entries: [string, string][], skipped: string[] }}
 */
export function serializableAliases(alias, root) {
  const entries = [];
  const skipped = [];
  const list = Array.isArray(alias)
    ? alias
    : alias && typeof alias === "object"
      ? Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
      : [];
  for (const item of list) {
    const find = item?.find;
    const replacement = item?.replacement;
    if (typeof find !== "string" || typeof replacement !== "string" || item.customResolver) {
      skipped.push(String(find));
      continue;
    }
    entries.push([
      find,
      replacement.startsWith(".") ? path.resolve(root, replacement) : replacement,
    ]);
  }
  return { entries, skipped };
}

/**
 * Apply the longest matching alias to `specifier`, as Vite does for string `find`s: a
 * match is the whole specifier or a prefix followed by `/`, so an `@` alias does not
 * capture `@scope/pkg`. A `find` that itself ends in `/` matches as a plain prefix.
 * Returns the specifier unchanged when nothing matches.
 *
 * @param {string} specifier
 * @param {[string, string][]} entries
 */
export function expandAlias(specifier, entries) {
  let best = null;
  for (const [find, replacement] of entries) {
    const matches = find.endsWith("/")
      ? specifier.startsWith(find)
      : specifier === find || specifier.startsWith(`${find}/`);
    if (matches && (best === null || find.length > best[0].length)) best = [find, replacement];
  }
  if (!best) return specifier;
  const [find, replacement] = best;
  const rest = specifier.slice(find.length);
  if (find.endsWith("/") && !replacement.endsWith("/")) return `${replacement}/${rest}`;
  return replacement + rest;
}
