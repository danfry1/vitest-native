// Resolution probe for the hot runtime's ESM generation stamp. This package is an
// ordinary externalized node_modules dependency, so under hot it is re-resolved per
// test file THROUGH the engine's loader hooks — and `import.meta.resolve` here
// returns exactly the URL the hooks produced, stamp included.
//
// The invariant under test: the test stack itself (vitest, @vitest/*, chai, and the
// engine) must NEVER carry a generation stamp. A stamped URL is a twin runtime —
// a SnapshotClient no one set up, fake-timer state the runner never reads — and the
// failures it causes downstream are emergent and order-dependent, which is why the
// gate asserts the resolution invariant instead of waiting for a symptom.
export const resolvedUrls = {
  vitest: import.meta.resolve("vitest"),
  snapshot: import.meta.resolve("@vitest/snapshot"),
  chai: import.meta.resolve("chai"),
  engine: import.meta.resolve("vitest-native"),
  // Control: this probe package itself IS expected to be stamped (its module-level
  // state must reset per file). If this stops carrying a stamp, the generation
  // mechanism is off entirely and the invariant above is passing vacuously.
  self: import.meta.url,
};
