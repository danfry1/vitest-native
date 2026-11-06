// One module per package across Vite, Node's require and Node's ESM loader, under
// experimental.ownershipModel: 'resolver' (ADR-0004/0005). vn-ownership-dual ships
// separate `import` and `require` builds, each with its own `store`: without the
// shared resolver, Vite takes the import build and Node the require build, and the
// package exists twice. Ported from the ownership-direction prototype's probes; with
// the flag off, the first three fail (tests-native/vitest.ownership.config.mts --mode off).
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { store } from "vn-ownership-dual";
import { store as sub } from "vn-ownership-dual/sub";
import reader from "vn-ownership-dual/reader";
import { read as dynamicRead } from "vn-ownership-dual/dynamic";
import nested from "vn-nested-reader";
import { resolverCounters } from "../../src/native/shared-resolver.mjs";

const require = createRequire(import.meta.url);

test("root import and require share one object", () => {
  expect(store).toBe(require("vn-ownership-dual").store);
});

test("a library's require sees what the test set", () => {
  store.value = "configured";
  expect(reader().value).toBe("configured");
});

test("deep conditional exports share identity", () => {
  expect(sub).toBe(require("vn-ownership-dual/sub").store);
});

test("a Node-owned ESM dynamic import shares identity", async () => {
  expect(await dynamicRead()).toBe(store);
});

test("a nested second version stays the requester's own", () => {
  expect(nested()).toBe("2.0.0");
});

test.runIf(process.env.VN_OWNERSHIP_FLAG !== "off")("the shared resolver answered here", () => {
  // The CommonJS realm runs in this thread; the counters prove the flag reached it
  // rather than every request quietly falling through to Node.
  expect(resolverCounters()?.cjs?.calls ?? 0).toBeGreaterThan(0);
});
