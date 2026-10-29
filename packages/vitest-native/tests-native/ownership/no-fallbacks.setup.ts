// Under experimental.ownershipModel, a resolver error must not pass as a quiet fall
// back to the old resolution (see shared-resolver.mjs). After each file, every realm
// this thread can see must have counted no fallback outside FALLBACK_ALLOWED.
import { afterAll, expect } from "vitest";
import { FALLBACK_ALLOWED, resolverCounters } from "../../src/native/shared-resolver.mjs";

afterAll(() => {
  const realms = resolverCounters() ?? {};
  const unexpected: Record<string, Record<string, number | string[]>> = {};
  for (const [realm, counters] of Object.entries(realms)) {
    for (const [reason, count] of Object.entries(counters.fallbacks)) {
      if (!FALLBACK_ALLOWED.includes(reason)) (unexpected[realm] ??= {})[reason] = count;
    }
    if (unexpected[realm]) unexpected[realm].errors = counters.errors;
  }
  expect(unexpected).toEqual({});
});
