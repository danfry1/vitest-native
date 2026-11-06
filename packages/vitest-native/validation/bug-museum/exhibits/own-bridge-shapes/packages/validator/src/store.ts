// Module-level state, a transitive project dependency and a builtin; counts its evaluations.
import { sep } from "node:path";
import { label } from "./helper";
const g = globalThis as { __evals?: Record<string, number> };
g.__evals ??= {};
g.__evals.store = (g.__evals.store ?? 0) + 1;
export const store: { value: string | null; tag: string } = { value: null, tag: label + sep };
export class Box {
  constructor(public v: number) {}
}
export default store;
