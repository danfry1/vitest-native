// Under experimental.ownershipModel, a resolver error must not pass as a quiet fall
// back to the old resolution (see shared-resolver.mjs). After each file, every realm
// this thread can see must have counted no fallback outside FALLBACK_ALLOWED. Vite's
// realm runs in the main process: vite-realm.global.ts checks it after the run.
import { afterAll, expect } from "vitest";
import { unexpectedFallbacks } from "../../src/native/shared-resolver.mjs";

afterAll(() => {
  expect(unexpectedFallbacks()).toEqual({});
});
