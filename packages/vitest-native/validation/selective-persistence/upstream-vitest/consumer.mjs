import {
  cycleIdentity,
  dependencyIdentity,
  identity,
  label,
  residentEvaluation,
} from "./resident-actual.mjs";

globalThis.__selective_repro_consumer_evaluations =
  (globalThis.__selective_repro_consumer_evaluations ?? 0) + 1;

export const consumerEvaluation = globalThis.__selective_repro_consumer_evaluations;
export const readResident = () => ({
  cycleIdentity,
  dependencyIdentity,
  identity,
  label,
  residentEvaluation,
});
