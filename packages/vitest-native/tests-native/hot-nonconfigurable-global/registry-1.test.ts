// One of five files on one hot worker. A library registry defined once per process as a
// non-configurable global, as the openai SDK does (#773). No reset can delete it, so it
// stays for the worker's life, and every file after the first still loads and runs.
const key = Symbol.for("vitest-native.test.registry.v1");
if (!(key in globalThis)) {
  Object.defineProperty(globalThis, key, { value: new Map(), configurable: false });
}

// A plain test-phase global next to it is still reset: no file sees another's.
test("the registry is there and this file's own globals start clean", () => {
  expect((globalThis as Record<symbol, unknown>)[key]).toBeInstanceOf(Map);
  expect((globalThis as Record<string, unknown>).__nonconfigTestPhase).toBeUndefined();
  (globalThis as Record<string, unknown>).__nonconfigTestPhase = import.meta.url;
});
