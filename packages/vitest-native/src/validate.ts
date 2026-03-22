import { createRequire } from "node:module";
import path from "node:path";

const KNOWN_OPTIONS = ["platform", "presets", "mocks", "diagnostics", "assetExts"];

function satisfiesMinimum(version: string, minimum: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[^0-9]*/, "")
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
): string | null {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    const pkgJsonPath = req.resolve(`${pkgName}/package.json`);
    const { version } = req(pkgJsonPath) as { version: string };
    if (!satisfiesMinimum(version, minimumVersion)) {
      return `vitest-native requires ${pkgName} >= ${minimumVersion}, but found ${version}. Please upgrade.`;
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
