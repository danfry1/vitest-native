// Top-level `for await`: needs an async body, like top-level await.
const g = globalThis as { __forAwaitRuns?: number };
g.__forAwaitRuns = (g.__forAwaitRuns ?? 0) + 1;
export const seen: number[] = [];
for await (const n of [1, 2]) seen.push(n);
