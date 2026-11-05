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

Object.assign(process.env, releaseAgeEnv());
