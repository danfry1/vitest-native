import { createRequire } from "node:module";
import path from "node:path";

const KNOWN_OPTIONS = [
  "platform",
  "presets",
  "mocks",
  "diagnostics",
  "assetExts",
  "engine",
  "transform",
  "hotRuntime",
];
const KNOWN_HOT_RUNTIME_OPTIONS = ["recycleAfterFiles", "memoryLimit", "preserveGlobals"];

function assertStringArray(value: unknown, option: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new TypeError(`[vitest-native] "${option}" must be an array of non-empty strings.`);
  }
}

function assertNonNegativeInteger(value: unknown, option: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`[vitest-native] "${option}" must be a non-negative safe integer.`);
  }
}

export function validateOptions(options: Record<string, unknown>): void {
  if (
    options.engine !== undefined &&
    options.engine !== "auto" &&
    options.engine !== "mock" &&
    options.engine !== "native"
  ) {
    throw new TypeError(`[vitest-native] "engine" must be "auto", "mock", or "native".`);
  }
  if (
    options.platform !== undefined &&
    options.platform !== "ios" &&
    options.platform !== "android"
  ) {
    throw new TypeError(`[vitest-native] "platform" must be "ios" or "android".`);
  }
  if (options.diagnostics !== undefined && typeof options.diagnostics !== "boolean") {
    throw new TypeError(`[vitest-native] "diagnostics" must be a boolean.`);
  }
  if (options.assetExts !== undefined) assertStringArray(options.assetExts, "assetExts");
  if (options.transform !== undefined) assertStringArray(options.transform, "transform");
  if (options.presets !== undefined && !Array.isArray(options.presets)) {
    throw new TypeError(`[vitest-native] "presets" must be an array.`);
  }
  if (
    options.mocks !== undefined &&
    (options.mocks === null || Array.isArray(options.mocks) || typeof options.mocks !== "object")
  ) {
    throw new TypeError(`[vitest-native] "mocks" must be a plain object.`);
  }

  const hotRuntime = options.hotRuntime;
  if (hotRuntime === undefined || typeof hotRuntime === "boolean") return;
  if (hotRuntime === null || Array.isArray(hotRuntime) || typeof hotRuntime !== "object") {
    throw new TypeError(`[vitest-native] "hotRuntime" must be a boolean or an options object.`);
  }

  const hotOptions = hotRuntime as Record<string, unknown>;
  for (const key of Object.keys(hotOptions)) {
    if (!KNOWN_HOT_RUNTIME_OPTIONS.includes(key)) {
      throw new TypeError(`[vitest-native] Unknown hotRuntime option "${key}".`);
    }
  }
  if (hotOptions.recycleAfterFiles !== undefined) {
    assertNonNegativeInteger(hotOptions.recycleAfterFiles, "hotRuntime.recycleAfterFiles");
  }
  if (hotOptions.memoryLimit !== undefined) {
    assertNonNegativeInteger(hotOptions.memoryLimit, "hotRuntime.memoryLimit");
  }
  if (hotOptions.preserveGlobals !== undefined) {
    assertStringArray(hotOptions.preserveGlobals, "hotRuntime.preserveGlobals");
  }
}

function satisfiesMinimum(version: string, minimum: string): boolean {
  // Strip prerelease/build metadata before splitting — "4.0.0-beta.3" split
  // on "." as ["4","0","0-beta","3"] put NaN in the PATCH slot, so a
  // prerelease sharing the minimum's major.minor (e.g. vitest 4.0.0-beta.x
  // against the 4.0.0 floor) failed the check and hard-errored at startup —
  // exactly the early-adopter installs that run betas. A prerelease of the
  // minimum itself is accepted (deliberate: rejecting it would re-break that
  // cohort; vite/vitest don't publish patch-level prereleases, so the
  // security-floor bypass this theoretically allows doesn't occur on npm).
  const parse = (v: string) =>
    v
      .replace(/^[^0-9]*/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map(Number);
  const [aMaj, aMin = 0, aPat = 0] = parse(version);
  const [bMaj, bMin = 0, bPat = 0] = parse(minimum);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

export function validatePeerDependency(
  pkgName: string,
  minimumVersion: string,
  projectRoot: string,
  maximumMajorExclusive?: number,
  minimumByMajor?: Record<number, string>,
): string | null {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    const pkgJsonPath = req.resolve(`${pkgName}/package.json`);
    const { version } = req(pkgJsonPath) as { version: string };
    const major = Number(version.replace(/^[^0-9]*/, "").split(".")[0]);
    const requiredMinimum = minimumByMajor?.[major] ?? minimumVersion;
    if (!satisfiesMinimum(version, requiredMinimum)) {
      return `vitest-native requires ${pkgName} >= ${requiredMinimum} for ${major}.x, but found ${version}. Please upgrade.`;
    }
    if (maximumMajorExclusive !== undefined && major >= maximumMajorExclusive) {
      return `vitest-native supports ${pkgName} >= ${minimumVersion} and < ${maximumMajorExclusive}, but found ${version}.`;
    }
    return null;
  } catch {
    return `vitest-native requires ${pkgName} >= ${minimumVersion}, but it was not found. Please install it.`;
  }
}

export function warnUnknownOptions(options: Record<string, unknown>): void {
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.includes(key)) {
      const suggestion = findClosest(key, KNOWN_OPTIONS);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      console.warn(`[vitest-native] Unknown option '${key}'.${hint}`);
    }
  }
}

function findClosest(input: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input.toLowerCase(), c.toLowerCase());
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
