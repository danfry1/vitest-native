// Probe helpers for the resident-state audit. A probe is a pair of files that run in
// name order on one worker: `-1` changes a resident, `-2` records what it then sees.
// Records go to files in VN_RESIDENT_AUDIT_DIR, not memory, because under per-file
// isolation the two files share nothing else.
import fs from "node:fs";
import path from "node:path";

const dir = () => {
  const value = process.env.VN_RESIDENT_AUDIT_DIR;
  if (!value) throw new Error("run through scripts/test-hot-residents.mjs (VN_RESIDENT_AUDIT_DIR)");
  return value;
};

/** Records what a probe's second file observed. One value per probe and run. */
export function observe(probe: string, value: unknown) {
  fs.appendFileSync(
    path.join(dir(), "observations.jsonl"),
    `${JSON.stringify({ probe, value })}\n`,
  );
}

/** Keeps a value for a later file in the same run, whatever the mode. */
export function remember(key: string, value: unknown) {
  fs.writeFileSync(path.join(dir(), `memo-${key}.json`), JSON.stringify(value));
}

export function recall<T>(key: string): T | undefined {
  const file = path.join(dir(), `memo-${key}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
}

/** Counts a call that may come from a listener an earlier file left behind. */
export function tally(key: string) {
  fs.appendFileSync(path.join(dir(), `tally-${key}`), "x");
}

export function tallied(key: string): number {
  const file = path.join(dir(), `tally-${key}`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").length : 0;
}
