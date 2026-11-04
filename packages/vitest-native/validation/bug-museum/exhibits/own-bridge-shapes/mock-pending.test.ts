// A vi.doMock registered but not yet resolved when Node requires: the bridge steps aside
// (serving it is the mock dispatcher's), Node loads the file as without the flag, and the
// test's import still gets the mock: the require did not put the real module in its place.
import { expect, test, vi } from "vitest";
import { requireStore } from "@m/feature";

test("a require while a vi.doMock is pending leaves the mock to the import", async () => {
  vi.doMock("@m/validator/helper", () => ({ label: "mocked-helper" }));
  requireStore();
  const imported = await import("@m/validator/store");
  expect(imported.store.tag.startsWith("mocked-helper")).toBe(true);
});
