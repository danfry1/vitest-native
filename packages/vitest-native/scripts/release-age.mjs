// The release cooldown for every registry install this package's scripts and validation
// runners make: a version must be RELEASE_AGE_DAYS old before a fixture installs it.
//
// The repository's own install already waits that long (bunfig.toml minimumReleaseAge),
// and Dependabot holds updates for the same week. Fixture installs did not: they resolved
// floating ranges fresh, so a release minutes old went straight into every packed gate.
// metro 0.87.3 did that while npm's CDN still answered 404 for its tarball, and every
// packed gate failed at install until it propagated. A week also keeps a malicious
// release, which is usually caught and removed within days, out of the fixtures.
//
// Importing this module applies the cooldown to process.env, so every npm and pnpm
// process a script starts inherits it:
//   npm_config_before               npm: resolve as of that instant
//   npm_config_minimum_release_age  pnpm (10.16+): minimum age in minutes
// Both were checked against `metro@^0.87.0` on the day of the incident: without them
// npm and pnpm resolved 0.87.3, with them 0.87.2. pnpm does not read the
// `pnpm_config_` spelling of this setting. tests/release-age.test.ts fails when a script
// that installs from the registry does not import this module, or picks its own cutoff.
//
// The one exception is VN_CANARY_UNAGED=1, which leaves the cooldown off. A canary tests
// a prerelease whose matching packages were published the same day, and the cooldown
// would hold every one of them back. Only compat-check.yml's read-only canary job may set
// it (docs/upstream-policy.md §4), which tests/release-age.test.ts checks.
//
// Unaged packages are only installed with their install scripts off: a package's
// install script is where a malicious release runs, before anything can review it. So the
// switch also sets npm_config_ignore_scripts, which reaches every npm a script starts
// (including the one `expo install` runs), and scripts pass CANARY_INSTALL_FLAGS to their
// own installs. `npm test` and `npm run` still run the script they name.

/** The cooldown in days. bunfig.toml's minimumReleaseAge must be the same, in seconds. */
export const RELEASE_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The environment that applies the cooldown to npm and pnpm, as of `now`. */
export function releaseAgeEnv(now = Date.now()) {
  return {
    npm_config_before: new Date(now - RELEASE_AGE_DAYS * DAY_MS).toISOString(),
    npm_config_minimum_release_age: String(RELEASE_AGE_DAYS * 24 * 60),
  };
}

/**
 * The cooldown for a bun install outside the repository (scripts/scratch-install.mjs). bun
 * reads bunfig.toml from the project it installs, so the repository's minimumReleaseAge
 * does not reach a scratch directory; these carry it there. The canary switch below does
 * not apply: a scratch install always keeps the cooldown.
 */
export const BUN_RELEASE_AGE_SECONDS = RELEASE_AGE_DAYS * 24 * 60 * 60;
export const bunReleaseAgeFlag = () => `--minimum-release-age=${BUN_RELEASE_AGE_SECONDS}`;
export const bunfigWithReleaseAge = () =>
  `[install]\nminimumReleaseAge = ${BUN_RELEASE_AGE_SECONDS}\n`;

/** The variable that leaves the cooldown off, for the canary job only. */
export const CANARY_UNAGED = "VN_CANARY_UNAGED";

/** Whether this is the canary's unaged run. */
export const canaryUnaged = process.env[CANARY_UNAGED] === "1";

/** Flags for every `npm install` a script runs: install scripts off in the unaged run. */
export const CANARY_INSTALL_FLAGS = canaryUnaged ? ["--ignore-scripts"] : [];

if (canaryUnaged) {
  process.env.npm_config_ignore_scripts = "true";
  console.log(
    `${CANARY_UNAGED}=1: no release cooldown, and no install scripts, for this canary run.`,
  );
} else {
  Object.assign(process.env, releaseAgeEnv());
}
