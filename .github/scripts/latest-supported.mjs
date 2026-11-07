// The install specs for the RN matrix's `latest-supported` column: for each peer with a
// supported ceiling, the newest release of the newest supported major (`vitest@^5`).
// Read from the package's own peer requirements (src/peer-requirements.ts, the source the
// startup checks use), so the column moves when a range does (docs/upstream-policy.md).
// `@vitest/coverage-v8` follows Vitest's major: a provider and runtime from different
// releases fail to load. bunfig's minimumReleaseAge still applies to what this resolves.
//
//   node .github/scripts/latest-supported.mjs   →   vitest@^5 vite@^8 …
import { PEER_REQUIREMENTS } from "../../packages/vitest-native/src/peer-requirements.ts";

export function latestSupportedSpecs(peers = PEER_REQUIREMENTS) {
  const specs = [];
  for (const peer of peers) {
    if (peer.maximumMajor === undefined) continue; // no ceiling: React follows React Native
    const newest = peer.maximumMajor - 1;
    specs.push(`${peer.name}@^${newest}`);
    if (peer.name === "vitest") specs.push(`@vitest/coverage-v8@^${newest}`);
  }
  return specs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(latestSupportedSpecs().join(" "));
}
