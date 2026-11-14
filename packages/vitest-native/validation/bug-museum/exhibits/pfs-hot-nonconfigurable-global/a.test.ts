// One of five files on one hot worker (a to e). A library that registers itself once per
// process as a non-configurable global, the way the openai SDK does.
const key = Symbol.for("lib.registry.v1");
if (!(key in globalThis)) {
  Object.defineProperty(globalThis, key, { value: new Map(), configurable: false });
}

test("the library's registry is on the global object", () => {
  expect((globalThis as Record<symbol, unknown>)[key]).toBeInstanceOf(Map);
});
