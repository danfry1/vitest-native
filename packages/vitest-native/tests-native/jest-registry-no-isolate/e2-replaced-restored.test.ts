// The next file in the same worker sees the original value: Vitest calls
// vi.restoreAllMocks() after each file, which jest-compat extends to replaced properties.
const target = (process as unknown as Record<symbol, { flag: boolean } | undefined>)[
  Symbol.for("vitest-native.no-isolate.replace-target")
];

test("the previous file's jest.replaceProperty was restored", () => {
  expect(target, "e1 ran first in this worker").toBeDefined();
  expect(target!.flag).toBe(false);
});

test("the setup did not wrap vi.restoreAllMocks again for this file", () => {
  expect(vi.restoreAllMocks).toBe(
    (process as unknown as Record<symbol, unknown>)[
      Symbol.for("vitest-native.no-isolate.restore-all-mocks")
    ],
  );
});
