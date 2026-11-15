// Splits a scripts/run-scripts.mjs list across parallel CI jobs.
//
// A shard is "k/n": the k-th of n jobs. The long scripts (those with their own CI
// deadline, scripts/ci/script-deadlines.mjs) are dealt out first, so they land on
// different jobs and each job starts its long one first; the rest follow in the listed
// order. Every script lands in exactly one shard.
//
// Without a shard the list runs as given. Starting the long scripts together on one
// runner made each slower: test:native:project-babel went from at most 316 s to 420 s on
// Linux and passed its deadline (2026-11-14), with the step no faster overall.

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

/**
 * The scripts in `shard` (from parseShard): the `long` ones first, dealt out in turn
 * with the rest in their listed order. All of them, as listed, without a shard.
 */
export function scriptsInShard(scripts, shard, long = []) {
  if (!shard) return scripts;
  const ordered = [
    ...long.filter((script) => scripts.includes(script)),
    ...scripts.filter((script) => !long.includes(script)),
  ];
  return ordered.filter((_, i) => i % shard.count === shard.index - 1);
}
