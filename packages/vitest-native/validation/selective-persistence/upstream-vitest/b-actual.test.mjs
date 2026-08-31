import { expect, test } from "vitest";
import {
  dependencyIdentity as directDependencyIdentity,
  readCycleIdentity,
} from "./resident-dependency-a.mjs";
import { consumerEvaluation, readResident } from "./consumer.mjs";

test("the next file gets the same actual through a fresh consumer", () => {
  const resident = readResident();
  globalThis.__selective_repro_files_executed =
    (globalThis.__selective_repro_files_executed ?? 0) + 1;
  expect(resident.label).toBe("actual");
  expect(resident.identity).toBe(globalThis.__selective_repro_identity);
  expect(resident.dependencyIdentity).toBe(directDependencyIdentity);
  expect(resident.cycleIdentity).toBe(readCycleIdentity());
  expect(resident.residentEvaluation).toBe(1);
  expect(consumerEvaluation).toBe(globalThis.__selective_repro_files_executed);
  expect(globalThis.__selective_repro_resident_evaluations).toBe(1);
});
