/**
 * Jest settings a project wires up for a library vitest-native handles itself, which
 * migrate reports as covered (delete) instead of carrying them over. Each recogniser is
 * narrow: it matches a setting whose whole effect is known, and anything more stays
 * with the project.
 *
 * Reanimated, wherever its preset applies:
 * - Its and Worklets' Jest resolvers: the native engine applies both itself where their
 *   own mocks run (native/jest-resolvers.mjs); elsewhere the preset replaces the package.
 * - A snapshot serializer that only strips `jestAnimatedProps`, `jestAnimatedStyle` and
 *   `jestInlineStyle`: Reanimated's real AnimatedComponent adds those props under Jest;
 *   its mock's createAnimatedComponent and the preset's module add none.
 * - A setup file that only calls `setUpTests()`: vitest-native registers
 *   toHaveAnimatedStyle and toHaveAnimatedProps itself, and Reanimated's own versions read
 *   props its mock does not set (presets/reanimated.ts keeps the engine's).
 */

const RESOLVER =
  /(?:^|node_modules\/)(react-native-(?:reanimated|worklets))\/jest\/resolver(?:\.js)?$/;

/** The library whose own Jest resolver `resolver` names, or null. */
export function libraryResolver(resolver: string): string | null {
  return RESOLVER.exec(resolver.replace(/\\/g, "/"))?.[1] ?? null;
}

const REANIMATED_TEST_PROPS = new Set([
  "jestAnimatedProps",
  "jestAnimatedStyle",
  "jestInlineStyle",
]);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Whether a serializer's source only strips Reanimated's Jest props: it names at least
 * one of them, loads nothing, and its only other string is `object` (typeof checks).
 */
export function stripsOnlyReanimatedProps(source: string): boolean {
  const code = withoutComments(source);
  if (/\brequire\s*\(|^\s*import\b/m.test(code)) return false;
  const strings = [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
  return (
    strings.some((s) => REANIMATED_TEST_PROPS.has(s)) &&
    strings.every((s) => REANIMATED_TEST_PROPS.has(s) || s === "object")
  );
}

const Q = `(['"])react-native-reanimated\\1`;
const SETUP_STATEMENTS = [
  /^(['"])use strict\1$/,
  new RegExp(`^import\\s*\\{\\s*setUpTests\\s*\\}\\s*from\\s*${Q}$`),
  new RegExp(`^(?:const|let|var)\\s*\\{\\s*setUpTests\\s*\\}\\s*=\\s*require\\(\\s*${Q}\\s*\\)$`),
  /^setUpTests\(\s*\)$/,
  new RegExp(`^require\\(\\s*${Q}\\s*\\)\\.setUpTests\\(\\s*\\)$`),
];

/**
 * Whether a setup file's source only calls Reanimated's `setUpTests()`, with no
 * arguments (a frame-time argument is a setting the project chose).
 */
export function onlyCallsSetUpTests(source: string): boolean {
  const statements = withoutComments(source)
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const calls = statements.filter((s) => /setUpTests\(\s*\)$/.test(s)).length;
  return calls === 1 && statements.every((s) => SETUP_STATEMENTS.some((re) => re.test(s)));
}
