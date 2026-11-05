/**
 * One release cooldown for every install the repository makes (scripts/release-age.mjs).
 *
 * The repository's own install (bunfig.toml minimumReleaseAge) and Dependabot's update
 * PRs (cooldown) waited a week for a new release; the packed-fixture installs did not,
 * and installed metro 0.87.3 minutes after it was published, while npm's CDN still
 * answered 404 for its tarball. These tests hold every place to the same number, and
 * fail when a script that installs from the registry does not apply it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Imported here rather than at the top: the module sets npm_config_before and
// npm_config_minimum_release_age on process.env, and this file puts them back afterwards
// so no other test in the worker inherits them.
const ENV_KEYS = ["npm_config_before", "npm_config_minimum_release_age"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let RELEASE_AGE_DAYS: number;
let releaseAgeEnv: (now?: number) => Record<(typeof ENV_KEYS)[number], string>;
let appliedEnv: Record<string, string | undefined>;
beforeAll(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  // @ts-expect-error — runtime .mjs, no types
  ({ RELEASE_AGE_DAYS, releaseAgeEnv } = await import("../scripts/release-age.mjs"));
  appliedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const read = (file: string) => fs.readFileSync(file, "utf8");

/** Every script file under scripts/ and validation/, as package-relative paths. */
function scriptFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(packageRoot, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(mjs|js|cjs|ts|mts)$/.test(entry.name)) out.push(rel);
    }
  };
  walk("scripts");
  walk("validation");
  return out;
}

/** A script's source without comment lines, so a comment never decides anything below. */
const code = (file: string) =>
  read(path.join(packageRoot, file))
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

/**
 * Whether a script runs a package manager: npm, npx, pnpm (or the pinned PNPM spec) or
 * yarn, as a spawned command or the start of a command string. Deliberately broad:
 * every such script must apply the cooldown or be exempted below with its reason, so a
 * new way of installing (`npm ci`, `npm pack <spec>`, `npx <pkg>`) cannot slip past.
 */
const runsPackageManager = (source: string) =>
  /["'`](?:npm|npx|pnpm|yarn)(?:["'`]|\s)/.test(source) || /\bPNPM\b/.test(source);

/** Scripts that run a package manager without resolving anything from the registry. */
const EXEMPT: Record<string, string> = {
  "scripts/check-package-size.mjs": "npm pack --dry-run of this package: nothing is resolved",
};

const installers = scriptFiles().filter(
  (file) => file !== "scripts/release-age.mjs" && runsPackageManager(code(file)),
);

describe("release cooldown", () => {
  it("finds the registry installers it guards", () => {
    // A detector that matched nothing would pass every test below.
    expect(installers).toContain("scripts/test-consumers.mjs");
    expect(installers).toContain("validation/config-axes/run.mjs");
    expect(installers).toContain("validation/vitest-semantics/run.mjs");
    expect(installers).toContain("scripts/check-exports.mjs"); // npx <pkg>
    expect(installers).toContain("scripts/sync-expo-module-table.mjs"); // npm pack <spec>
    // A bun install from the frozen lockfile is governed by bunfig.toml and the lockfile.
    expect(installers).not.toContain("validation/bug-museum/build-ref.mjs");
    // Every exemption still names a file that runs a package manager.
    for (const file of Object.keys(EXEMPT)) expect(installers).toContain(file);
  });

  it("is applied by every script that runs a package manager, at the top of the file", () => {
    const missing = installers.filter((file) => {
      if (file in EXEMPT) return false;
      const rel = file.startsWith("scripts/")
        ? "./release-age.mjs"
        : "../../scripts/release-age.mjs";
      // An import inside a template string (a generated file) would not count, so the
      // line must come before the first line that is not an import, comment or blank.
      const lines = read(path.join(packageRoot, file)).split("\n");
      for (const line of lines) {
        if (line === `import "${rel}";`) return false;
        if (!/^(import |\s|\/\/|\/\*|\*|#!|\}|$)/.test(line) && !/^\s*[\w{},* ]+from /.test(line))
          return true;
      }
      return true;
    });
    expect(missing, `import the cooldown in: ${missing.join(", ")}`).toEqual([]);
  });

  it("is chosen in one place: no script picks, changes or removes its own cutoff", () => {
    const own = scriptFiles()
      .filter((file) => file !== "scripts/release-age.mjs")
      .filter((file) =>
        /--before\b|minimumReleaseAge|minimum-release-age|npm_config_(?:before|minimum_release_age)\s*[:=]|delete\s[\w.[\]"']*npm_config_(?:before|minimum_release_age)/.test(
          code(file),
        ),
      );
    expect(own).toEqual([]);
  });

  it("pins a pnpm that reads its minimum age from npm_config_minimum_release_age", () => {
    // pnpm added minimumReleaseAge in 10.16. The npm_config_ spelling was checked on
    // 10.34; another major has to be checked again before it is pinned here.
    const pins = scriptFiles().flatMap((file) =>
      [...code(file).matchAll(/pnpm@(\d+)\.(\d+)\.\d+/g)].map((m) => ({
        file,
        major: +m[1],
        minor: +m[2],
      })),
    );
    expect(pins.length).toBeGreaterThan(0);
    const unverified = pins.filter(({ major, minor }) => major !== 10 || minor < 16);
    expect(unverified).toEqual([]);
  });

  it("reaches installs that run in a container", () => {
    const unforwarded = installers.filter((file) => {
      const source = read(path.join(packageRoot, file));
      return (
        /["']docker["']/.test(source) &&
        !(
          source.includes('"npm_config_before"') &&
          source.includes('"npm_config_minimum_release_age"')
        )
      );
    });
    expect(unforwarded).toEqual([]);
  });

  it("sets npm's cutoff and pnpm's minimum age to the same span", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const env = releaseAgeEnv(now);
    expect(now - Date.parse(env.npm_config_before)).toBe(RELEASE_AGE_DAYS * 24 * 3600 * 1000);
    expect(Number(env.npm_config_minimum_release_age)).toBe(RELEASE_AGE_DAYS * 24 * 60);
  });

  it("applies to this process on import, so child installs inherit it", () => {
    expect(appliedEnv.npm_config_minimum_release_age).toBe(String(RELEASE_AGE_DAYS * 24 * 60));
    expect(Date.parse(appliedEnv.npm_config_before as string)).toBeLessThan(
      Date.now() - (RELEASE_AGE_DAYS * 24 * 3600 - 60) * 1000,
    );
  });

  it("matches the repository's own install cooldown and Dependabot's", () => {
    const bunfig = read(path.join(repoRoot, "bunfig.toml"));
    expect(Number(/^minimumReleaseAge\s*=\s*(\d+)/m.exec(bunfig)?.[1])).toBe(
      RELEASE_AGE_DAYS * 24 * 3600,
    );
    const dependabot = read(path.join(repoRoot, ".github/dependabot.yml"));
    const days = [...dependabot.matchAll(/^\s+(?:default|semver-\w+)-days:\s*(\d+)/gm)].map(
      (match) => Number(match[1]),
    );
    expect(days.length).toBeGreaterThan(0);
    expect(new Set(days)).toEqual(new Set([RELEASE_AGE_DAYS]));
  });
});
