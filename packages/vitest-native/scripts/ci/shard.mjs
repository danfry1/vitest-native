// Splits a scripts/run-scripts.mjs list across parallel CI jobs.
//
// A shard is "k/n": the k-th of n jobs. Scripts are dealt out in turn in the order
// given, so a list ordered longest first (as test:native is) puts its longest scripts on
// different jobs and the jobs finish close together. Every script lands in exactly one
// shard.

/** Parses "k/n" (1 <= k <= n). Empty or undefined means no sharding; anything else throws. */
export function parseShard(spec) {
  if (spec === undefined || spec === "") return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!(index >= 1 && index <= count)) {
    throw new Error(`a shard is "k/n" with 1 <= k <= n, got: '${spec}'`);
  }
  return { index, count };
}

/** The scripts in `shard` (from parseShard), in their given order; all of them without one. */
export function scriptsInShard(scripts, shard) {
  if (!shard) return scripts;
  return scripts.filter((_, i) => i % shard.count === shard.index - 1);
}
