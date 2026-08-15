import { VitestNativeTypeError } from "./errors.mjs";
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
const KNOWN_HOT_RUNTIME_OPTIONS = [
  "recycleAfterFiles",
  "memoryLimit",
  "preserveGlobals",
  "esmGeneration",
];

function assertStringArray(value: unknown, option: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `"${option}" must be an array of non-empty strings.`,
    );
  }
}

function assertNonNegativeInteger(value: unknown, option: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `"${option}" must be a non-negative safe integer.`,
    );
  }
}

export function validateOptions(options: Record<string, unknown>): void {
  if (
    options.engine !== undefined &&
    options.engine !== "auto" &&
    options.engine !== "mock" &&
    options.engine !== "native"
  ) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `"engine" must be "auto", "mock", or "native".`,
    );
  }
  if (
    options.platform !== undefined &&
    options.platform !== "ios" &&
    options.platform !== "android"
  ) {
    throw new VitestNativeTypeError("INVALID_OPTION", `"platform" must be "ios" or "android".`);
  }
  if (options.diagnostics !== undefined && typeof options.diagnostics !== "boolean") {
    throw new VitestNativeTypeError("INVALID_OPTION", `"diagnostics" must be a boolean.`);
  }
  if (options.assetExts !== undefined) assertStringArray(options.assetExts, "assetExts");
  // Two shapes, like `presets`: an array is the include list; an object names
  // `include` and/or `exclude`.
  if (options.transform !== undefined) {
    if (Array.isArray(options.transform)) {
      assertStringArray(options.transform, "transform");
    } else if (options.transform !== null && typeof options.transform === "object") {
      const shape = options.transform as { include?: unknown; exclude?: unknown };
      const unknownKeys = Object.keys(shape).filter((k) => k !== "include" && k !== "exclude");
      if (unknownKeys.length > 0) {
        throw new VitestNativeTypeError(
          "INVALID_OPTION",
          `"transform" accepts only "include" and "exclude"; received ${unknownKeys
            .map((k) => `"${k}"`)
            .join(", ")}.`,
        );
      }
      if (shape.include !== undefined) assertStringArray(shape.include, "transform.include");
      if (shape.exclude !== undefined) assertStringArray(shape.exclude, "transform.exclude");
    } else {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `"transform" must be an array of package names, or an object with "include" and/or "exclude".`,
      );
    }
  }
  // Two shapes: an array replaces auto-detection, an object of booleans keeps it and
  // switches named presets off. Anything else is rejected with both spellings named,
  // since "must be an array" would now be wrong advice.
  if (options.presets !== undefined && !Array.isArray(options.presets)) {
    const isPlainObject =
      options.presets !== null &&
      typeof options.presets === "object" &&
      Object.values(options.presets as Record<string, unknown>).every(
        (v) => typeof v === "boolean",
      );
    if (!isPlainObject) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `"presets" must be an array of presets, or an object of booleans to switch ` +
          `auto-detected presets off (for example { navigation: false }).`,
      );
    }
  }
  if (
    options.mocks !== undefined &&
    (options.mocks === null || Array.isArray(options.mocks) || typeof options.mocks !== "object")
  ) {
    throw new VitestNativeTypeError("INVALID_OPTION", `"mocks" must be a plain object.`);
  }

  const hotRuntime = options.hotRuntime;
  if (hotRuntime === undefined || typeof hotRuntime === "boolean") return;
  if (hotRuntime === null || Array.isArray(hotRuntime) || typeof hotRuntime !== "object") {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `"hotRuntime" must be a boolean or an options object.`,
    );
  }

  const hotOptions = hotRuntime as Record<string, unknown>;
  for (const key of Object.keys(hotOptions)) {
    if (!KNOWN_HOT_RUNTIME_OPTIONS.includes(key)) {
      // The sibling message for top-level options offers a suggestion; this one did
      // not, so a typo produced a bare rejection with no way forward.
      const suggestion = findClosest(key, KNOWN_HOT_RUNTIME_OPTIONS);
      throw new VitestNativeTypeError(
        "UNKNOWN_OPTION",
        `Unknown hotRuntime option "${key}".` +
          (suggestion ? ` Did you mean '${suggestion}'?` : "") +
          ` Valid options: ${KNOWN_HOT_RUNTIME_OPTIONS.join(", ")}.`,
      );
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
  if (hotOptions.esmGeneration !== undefined && typeof hotOptions.esmGeneration !== "boolean") {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `"hotRuntime.esmGeneration" must be a boolean.`,
    );
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
