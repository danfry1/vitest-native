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
  { name: "vitest", minimum: "4.0.0", maximumMajor: 5 },
  {
    name: "vite",
    minimum: "6.4.2",
    maximumMajor: 9,
    minimumByMajor: { 6: "6.4.2", 7: "7.3.2", 8: "8.0.5" },
  },
  { name: "react", minimum: "18.0.0" },
];
