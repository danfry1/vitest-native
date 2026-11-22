/**
 * Whether a run's engine banner shows what the run asked for. A packed gate that only
 * checks for passing tests also passes when the engine silently fell back to the mock
 * engine, or when a hot row ran per-file.
 *
 * `engine` is "native" or "mock"; `hot` whether the hot runtime must run. Returns what
 * is wrong, or undefined.
 */
export function floorBannerProblem(output, { engine, hot = false }, reactNativeVersion) {
  const banner = /\[vitest-native\] engine: [^\n]*/.exec(output)?.[0];
  if (!banner) return "no engine banner";
  if (engine === "native" && !banner.includes(`real react-native@${reactNativeVersion} `)) {
    return `expected real react-native@${reactNativeVersion}, got: ${banner}`;
  }
  if (engine === "mock" && !banner.includes("engine: mock")) {
    return `expected the mock engine, got: ${banner}`;
  }
  const isHot = /, hot runtime[,)]/.test(banner);
  if (hot && !isHot) return `expected the hot runtime, got: ${banner}`;
  if (!hot && isHot) return `expected per-file, got: ${banner}`;
  return undefined;
}
