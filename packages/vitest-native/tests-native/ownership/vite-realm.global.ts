// Under experimental.ownershipModel, Vite's realm resolves in the main process, where no
// test file's setup can see its counters. After the run it must have answered requests
// (so this check is not vacuous) and counted no fallback outside FALLBACK_ALLOWED.
import { resolverCounters, unexpectedFallbacks } from "../../src/native/shared-resolver.mjs";

export function teardown() {
  const vite = resolverCounters()?.vite;
  if (!vite || vite.calls === 0) {
    throw new Error("experimental.ownershipModel: Vite's realm answered no request in this run");
  }
  const unexpected = unexpectedFallbacks({ vite });
  if (Object.keys(unexpected).length > 0) {
    throw new Error(
      `experimental.ownershipModel: Vite's realm fell back outside FALLBACK_ALLOWED: ` +
        JSON.stringify(unexpected),
    );
  }
}
