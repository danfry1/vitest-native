// The version a canary should install for a package: the newest of its prerelease
// channels (`next`, `beta`, `rc`) that is newer than `latest`, or nothing when every
// channel is behind it. Channel tags go stale between cycles (a `beta` older than
// `latest`), so the tag alone cannot say whether there is anything ahead to test.
//
//   node .github/scripts/canary-version.mjs <package>   →   e.g. 0.89.0-rc.0, or empty
import { execFileSync } from "node:child_process";

export const CHANNELS = ["next", "beta", "rc"];

/** [major, minor, patch, prerelease parts] for comparison; null if not a version. */
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? null };
}

/** Semver order: core first, then a prerelease sorts before its release. */
export function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre || !y.pre) return (x.pre ? -1 : 0) - (y.pre ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** The newest channel version ahead of `latest`, or null. */
export function canaryVersion(distTags) {
  let best = null;
  for (const channel of CHANNELS) {
    const version = distTags[channel];
    if (!version || !parse(version)) continue;
    if (compareVersions(version, distTags.latest) <= 0) continue;
    if (!best || compareVersions(version, best) > 0) best = version;
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2];
  const tags = JSON.parse(execFileSync("npm", ["view", name, "dist-tags", "--json"], { encoding: "utf8" }));
  console.log(canaryVersion(tags) ?? "");
}
