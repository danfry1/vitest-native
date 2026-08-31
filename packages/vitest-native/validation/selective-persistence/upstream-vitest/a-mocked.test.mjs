import { expect, test, vi } from "vitest";
import {
  dependencyIdentity as directDependencyIdentity,
  readCycleIdentity,
} from "./resident-dependency-a.mjs";

vi.mock("./resident-actual.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  label: "mocked",
}));

import { consumerEvaluation, readResident } from "./consumer.mjs";

test("a file-local mock overlays the persistent actual", async () => {
  const resident = readResident();
  const actual = await vi.importActual("./resident-actual.mjs");
  globalThis.__selective_repro_files_executed =
    (globalThis.__selective_repro_files_executed ?? 0) + 1;
  expect(resident.label).toBe("mocked");
  expect(resident.identity).toBe(globalThis.__selective_repro_identity);
  expect(resident.identity).toBe(actual.identity);
  expect(resident.dependencyIdentity).toBe(directDependencyIdentity);
  expect(resident.cycleIdentity).toBe(readCycleIdentity());
  expect(resident.residentEvaluation).toBe(1);
  expect(consumerEvaluation).toBe(globalThis.__selective_repro_files_executed);
  expect(globalThis.__selective_repro_resident_evaluations).toBe(1);
});
