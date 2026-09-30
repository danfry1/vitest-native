import { readDependencyIdentity } from "./resident-dependency-b.mjs";

globalThis.__selective_repro_dependency_evaluations =
  (globalThis.__selective_repro_dependency_evaluations ?? 0) + 1;

export const dependencyIdentity = {};
export const readCycleIdentity = () => readDependencyIdentity();
