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
 * - A setup file that only calls `setUpTests()`, in a suite that also mocks Reanimated:
 *   vitest-native registers toHaveAnimatedStyle and toHaveAnimatedProps itself, and
 *   Reanimated's own versions read props its mock does not set (presets/reanimated.ts
 *   keeps the engine's). A suite that calls `setUpTests()` and mocks Reanimated nowhere
 *   ran the real library: migrate turns the preset off for it instead and keeps the file
 *   (callsReanimatedSetUpTests, #834).
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

/**
 * The source without its whole-line comments, or null when a comment marker appears
 * anywhere else (a trailing comment, `src/*` inside a comment, `//` in a string): a
 * regex that strips comments across lines can swallow real code between a stray `/*`
 * and a later `*\/`, and a file that cannot be read exactly is kept.
 */
function withoutComments(source: string): string | null {
  const code: string[] = [];
  let inBlock = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        if (line.includes("/*") || line.includes("//")) return null;
        continue;
      }
      if (end !== line.length - 2) return null;
      inBlock = false;
    } else if (line.startsWith("//")) {
      if (line.includes("/*") || line.includes("*/")) return null;
    } else if (line.startsWith("/*")) {
      const end = line.indexOf("*/", 2);
      if (line.indexOf("/*", 2) !== -1 || line.includes("//")) return null;
      if (end === -1) inBlock = true;
      else if (end !== line.length - 2) return null;
    } else if (line.includes("/*") || line.includes("*/") || line.includes("//")) {
      return null;
    } else {
      code.push(raw);
    }
  }
  return inBlock ? null : code.join("\n");
}

/**
 * Whether a serializer's source only strips Reanimated's Jest props: it names at least
 * one of them, loads nothing, and its only other string is `object` (typeof checks).
 */
export function stripsOnlyReanimatedProps(source: string): boolean {
  const code = withoutComments(source);
  if (code === null || /\brequire\s*\(|^\s*import\b/m.test(code)) return false;
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
  const code = withoutComments(source);
  if (code === null) return false;
  const statements = code
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const calls = statements.filter((s) => /setUpTests\(\s*\)$/.test(s)).length;
  return calls === 1 && statements.every((s) => SETUP_STATEMENTS.some((re) => re.test(s)));
}

/**
 * Whether a setup file runs Reanimated's `setUpTests()`: it takes `setUpTests` from
 * `react-native-reanimated` and calls it, with or without arguments. Whole-line comments
 * are ignored; a file that cannot be read exactly does not count.
 */
export function callsReanimatedSetUpTests(source: string): boolean {
  const code = withoutComments(source);
  if (code === null) return false;
  const lib = `['"]react-native-reanimated['"]`;
  const takes = new RegExp(
    `\\{[^}]*\\bsetUpTests\\b[^}]*\\}\\s*(?:=\\s*require\\(\\s*${lib}\\s*\\)|from\\s*${lib})`,
  );
  const direct = new RegExp(`require\\(\\s*${lib}\\s*\\)\\.setUpTests\\(`);
  return direct.test(code) || (takes.test(code) && /(?:^|[^.\w])setUpTests\s*\(/m.test(code));
}

/**
 * Whether a setup file mocks Reanimated itself (`jest.mock('react-native-reanimated', …)`),
 * so the suite runs its mock, not the library. A commented-out mock does not count; a file
 * that cannot be read exactly does, which keeps the mock, as before.
 */
export function mocksReanimated(source: string): boolean {
  const code = withoutComments(source);
  return code === null || /\bjest\.mock\(\s*(['"])react-native-reanimated\1/.test(code);
}
