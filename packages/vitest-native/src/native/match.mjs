// Builds a predicate that matches files located under any of the given
// node_modules package names (used by both the require hook and the ESM loader
// to extend transformation to configured third-party RN libraries).
export function buildPkgMatcher(pkgs) {
  const res = (pkgs || []).map(
    (p) => new RegExp("[\\\\/]" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\\\/]"),
  );
  return (normPath) => res.some((re) => re.test(normPath));
}
