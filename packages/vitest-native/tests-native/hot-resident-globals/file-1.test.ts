// One of two files on one hot worker. vitest-native's resident modules create their
// worker-lifetime globals (RESIDENT_GLOBALS) lazily, often during a worker's first file,
// as this file does the first time. The reset keeps them, so the second file sees the
// same objects; it used to delete them, and the counters read empty from then on (#792).
const keys = ["vitest-native.bridge", "vitest-native.bridged", "vitest-native.resolutionMemo"];
const first = ((process as { __vnResidentGlobals?: Record<string, object> }).__vnResidentGlobals ??=
  {});

test.each(keys)("%s is the worker's one object in every file", (name) => {
  const g = globalThis as Record<symbol, object>;
  const held = (g[Symbol.for(name)] ??= { count: 0 });
  first[name] ??= held;
  expect(held, "the object the worker's first file created").toBe(first[name]);
});
