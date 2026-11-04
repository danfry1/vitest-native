// A vi.doMock registered but not yet applied when Node requires a module that imports the
// mocked file: the mock cannot be had yet, so the require fails by name, naming the
// importer, rather than evaluating the real file in its place; the test's import still
// gets the mock.
import { expect, test, vi } from "vitest";
import { requireStore } from "@m/feature";

test("a require while a vi.doMock is pending fails by name, and the import gets the mock", async () => {
  vi.doMock("@m/validator/helper", () => ({ label: "mocked-helper" }));
  expect(() => requireStore()).toThrow(
    expect.objectContaining({
      code: "MOCK_NOT_SEEN_BY_NODE",
      message: expect.stringMatching(/store\.ts/),
    }),
  );
  const imported = await import("@m/validator/store");
  expect(imported.store.tag.startsWith("mocked-helper")).toBe(true);
});
