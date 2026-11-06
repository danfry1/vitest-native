const g = globalThis as { __evals?: Record<string, number> };
g.__evals ??= {};
g.__evals.helper = (g.__evals.helper ?? 0) + 1;
export const label = "helper";
