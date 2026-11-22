// The next file in the same worker sees the original value: the jest-compat setup restores
// a replaced property when its file ends, as Jest's next file has fresh modules.
const target = (process as unknown as Record<symbol, { flag: boolean } | undefined>)[
  Symbol.for("vitest-native.no-isolate.replace-target")
];

test("the previous file's jest.replaceProperty was restored", () => {
  expect(target, "e1 ran first in this worker").toBeDefined();
  expect(target!.flag).toBe(false);
});

