/**
 * The supported peer-dependency ranges — single source consumed by the plugin's
 * startup validation (plugin.ts configResolved) and the CLI's doctor command,
 * so the two can never drift apart.
 *
 * `minimumByMajor` entries are security floors: the minimum for that major is
 * the release carrying a security fix, not just the earliest compatible one.
 */
export interface PeerRequirement {
  name: string;
  minimum: string;
  maximumMajor?: number;
  minimumByMajor?: Record<number, string>;
}

export const PEER_REQUIREMENTS: PeerRequirement[] = [
  // Vitest 5 is supported: the whole gate (native, hot, cross-check, soak) runs
  // against it in CI. The ceiling stays one major ahead of what is proven rather
  // than open-ended — Vitest churn is what bit-rotted this plugin's predecessor,
  // so a new major must be verified before it is promised.
  { name: "vitest", minimum: "4.0.0", maximumMajor: 6 },
  {
    name: "vite",
    minimum: "6.4.2",
    maximumMajor: 9,
    minimumByMajor: { 6: "6.4.2", 7: "7.3.2", 8: "8.0.5" },
  },
  { name: "react", minimum: "18.0.0" },
];
