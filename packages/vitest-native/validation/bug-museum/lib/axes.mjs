// STATUS.md records every flag axis at its default: --ownership off and --node-mocks unset.
// A verdict from a run with either flag is another column, which status.mjs refuses.

/** Why `verdict` cannot be a STATUS.md column, or null when it ran with the defaults. */
export function axisProblem(verdict) {
  const flags = [];
  if (verdict.ownershipModel) flags.push(`experimental.ownershipModel: ${verdict.ownershipModel}`);
  if (verdict.nodeMocks) flags.push(`--node-mocks ${verdict.nodeMocks}`);
  if (flags.length === 0) return null;
  return `ran with ${flags.join(" and ")}; STATUS.md records the flags off`;
}
