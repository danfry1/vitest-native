/**
 * Every behaviour change still behind a flag, with the record that decides it and the
 * date by which it is either made the default or removed. At most two are live at
 * once; a flag past its `decideBy` with no decision is a release blocker
 * (tests/flags.test.ts enforces both).
 */
export interface ExperimentalFlag {
  /** The option path users set. */
  name: string;
  /** The architecture decision record that owns the change. */
  adr: string;
  /** The release that first shipped it. */
  since: string;
  /** ISO date: made the default, or removed, by then. */
  decideBy: string;
}

export const EXPERIMENTAL_FLAGS: readonly ExperimentalFlag[] = [
  {
    name: "experimental.ownershipModel",
    adr: "0004/0005",
    since: "0.15.0",
    decideBy: "2026-11-25",
  },
];

/** The most flags live at once (ADR-0001). */
export const MAX_LIVE_FLAGS = 2;
