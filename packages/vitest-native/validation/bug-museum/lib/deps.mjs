// Each column's exhibits run against its own ref's installed packages (run.mjs `deps`,
// lib/materialise.mjs): a verdict materialised against another ref's dependencies
// measured those, not the bug, and status.mjs refuses it.

/** Why `verdict` was not materialised against its own build's dependencies, or null. */
export function depsProblem(verdict) {
  const build = verdict?.build?.sha;
  const deps = verdict?.deps?.sha;
  if (deps === undefined)
    return `records no dependencies it was materialised against; re-run it with this run.mjs`;
  if (deps !== build)
    return `was materialised against ${deps}'s dependencies, not its build's (${build ?? "no SHA"}); re-run it`;
  return null;
}
