import { dependencyIdentity, readCycleIdentity } from "./resident-dependency-a.mjs";

globalThis.__selective_repro_resident_evaluations =
  (globalThis.__selective_repro_resident_evaluations ?? 0) + 1;

export const identity = {};
export const label = "actual";
export const residentEvaluation = globalThis.__selective_repro_resident_evaluations;
export { dependencyIdentity };
export const cycleIdentity = readCycleIdentity();
globalThis.__selective_repro_identity = identity;
