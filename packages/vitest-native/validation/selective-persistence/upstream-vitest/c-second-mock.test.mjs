import { expect, test, vi } from "vitest";

vi.mock("./resident-actual.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  label: "second-mock",
}));

import { consumerEvaluation, readResident } from "./consumer.mjs";

test("a different file can install a different overlay", () => {
  const resident = readResident();
  globalThis.__selective_repro_files_executed =
    (globalThis.__selective_repro_files_executed ?? 0) + 1;
  expect(resident.label).toBe("second-mock");
  expect(resident.identity).toBe(globalThis.__selective_repro_identity);
  expect(resident.residentEvaluation).toBe(1);
  expect(consumerEvaluation).toBe(globalThis.__selective_repro_files_executed);
});
