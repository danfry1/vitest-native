import { expect, test, vi } from "vitest";

vi.unmock("./resident-actual.mjs");

import { consumerEvaluation, readResident } from "./consumer.mjs";

test("an explicit unmock reveals the persistent actual", () => {
  const resident = readResident();
  globalThis.__selective_repro_files_executed =
    (globalThis.__selective_repro_files_executed ?? 0) + 1;
  expect(resident.label).toBe("actual");
  expect(resident.identity).toBe(globalThis.__selective_repro_identity);
  expect(resident.residentEvaluation).toBe(1);
  expect(consumerEvaluation).toBe(globalThis.__selective_repro_files_executed);
});
