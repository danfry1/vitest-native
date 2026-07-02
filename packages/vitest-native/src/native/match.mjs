// Builds a predicate that matches files located under any of the given
// node_modules package names (used by both the require hook and the ESM loader
// to extend transformation to configured third-party RN libraries).
export function buildPkgMatcher(pkgs) {
  const res = (pkgs || []).map(
    (p) => new RegExp("[\\\\/]" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\\\/]"),
  );
  return (normPath) => res.some((re) => re.test(normPath));
}

// The bare package name of an import specifier ("@scope/pkg/sub" → "@scope/pkg",
// "pkg/sub" → "pkg"). Relative/absolute specifiers yield strings that can never
// collide with a package name, so callers only need an equality check.
export function packageNameOf(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

// The leaf module name a subpath import points at ("pkg/lib/Swipeable" or
// "pkg/Swipeable.ios.js" → "Swipeable"), used to pick the matching export off a
// preset/RN mock. Returns null when there is no usable leaf (trailing slash).
export function subpathLeafOf(specifier) {
  const base = specifier.split("/").pop();
  if (!base) return null;
  return base.split(".")[0] || null;
}

// Deep entries of preset packages that are deliberately Node-safe and must NOT
// be shadowed by the preset mock: test utilities and tooling entry points
// (react-native-gesture-handler/jest-utils, react-native-reanimated/mock,
// */jestSetup, babel `*/plugin` entries). They are designed to run under a
// Node test runner, and shadowing them replaces working code with undefined
// exports.
const UTILITY_SUBPATH_LEAVES = new Set(["jest-utils", "jestSetup", "mock", "plugin"]);

export function isUtilitySubpath(specifier) {
  const leaf = subpathLeafOf(specifier);
  return leaf !== null && UTILITY_SUBPATH_LEAVES.has(leaf);
}
