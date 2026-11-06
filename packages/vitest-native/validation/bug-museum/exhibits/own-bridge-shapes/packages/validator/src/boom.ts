// Throws while it is evaluated, after a side effect.
const g = globalThis as { __boomEvals?: number };
g.__boomEvals = (g.__boomEvals ?? 0) + 1;
export const before = 1;
throw new Error("boom-original");
