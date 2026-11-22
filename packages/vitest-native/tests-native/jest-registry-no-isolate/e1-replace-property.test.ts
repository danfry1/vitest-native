// Replaces a value on an object that outlives the file (as a resident package's state
// does) and never restores it, as a Jest-era test can: Jest's next file has fresh modules.
declare const jest: { replaceProperty(object: object, key: string, value: unknown): unknown };

const target = ((process as unknown as Record<symbol, { flag: boolean }>)[
  Symbol.for("vitest-native.no-isolate.replace-target")
] ??= { flag: false });

test("replaces and leaves it replaced", () => {
  jest.replaceProperty(target, "flag", true);
  expect(target.flag).toBe(true);
});
