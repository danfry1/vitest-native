/**
 * Expiry tests for upstream workarounds (docs/upstream-workarounds.md). An expiry test
 * calls `stillNeeded(peer, fixedIn)`: it passes while the supported range still admits a
 * release with the bug, and fails once the hard floor includes the upstream fix. That
 * failure means the workaround can go: delete it, its tests and its row.
 */
import { PEER_REQUIREMENTS } from "../../src/peer-requirements";

const parts = (version: string) => version.split(/[.-]/).slice(0, 3).map(Number);

/** Whether version `a` is at or after `b` (release versions, major.minor.patch). */
export function atOrAfter(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
}

/** Throws once `peer`'s hard floor is at or after `fixedIn`. */
export function stillNeeded(
  peer: string,
  fixedIn: string,
  requirements: readonly { name: string; minimum: string }[] = PEER_REQUIREMENTS,
): void {
  const requirement = requirements.find((entry) => entry.name === peer);
  if (!requirement) throw new Error(`${peer} has no peer requirement: an expiry test needs one`);
  if (atOrAfter(requirement.minimum, fixedIn)) {
    throw new Error(
      `The ${peer} floor (${requirement.minimum}) now includes the upstream fix (${fixedIn}): ` +
        `delete the workaround, its tests and its row in docs/upstream-workarounds.md.`,
    );
  }
}
