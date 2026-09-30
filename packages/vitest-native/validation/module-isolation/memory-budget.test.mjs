import assert from "node:assert/strict";
import { memoryBudgetConstants, memoryPlan } from "./memory-budget.mjs";

const { MIB } = memoryBudgetConstants;
const gib = (value) => value * 1024 * MIB;

const cases = [
  { constrainedMemory: 512 * MIB, workers: 16, expectedWorkers: 1, expectedHeapMiB: 96 },
  { constrainedMemory: gib(1), workers: 16, expectedWorkers: 1, expectedHeapMiB: 241 },
  { constrainedMemory: gib(2), workers: 16, expectedWorkers: 4, expectedHeapMiB: 193 },
  { constrainedMemory: gib(4), workers: 16, expectedWorkers: 4, expectedHeapMiB: 460 },
  { constrainedMemory: gib(8), workers: 8, expectedWorkers: 4, expectedHeapMiB: 512 },
];

for (const testCase of cases) {
  const plan = memoryPlan({
    totalMemory: gib(32),
    constrainedMemory: testCase.constrainedMemory,
    requestedWorkers: testCase.workers,
  });
  assert.equal(plan.maxWorkers, testCase.expectedWorkers);
  assert.ok(
    Math.abs(plan.workerHeapLimit / MIB - testCase.expectedHeapMiB) < 1,
    `unexpected heap plan for ${testCase.constrainedMemory / MIB} MiB: ${plan.workerHeapLimit / MIB}`,
  );
  assert.ok(plan.softRssLimit < plan.hardRssLimit);
  assert.ok(plan.hardRssLimit < plan.limit);
}

const hostOnly = memoryPlan({ totalMemory: gib(16), constrainedMemory: 0, requestedWorkers: 4 });
assert.equal(hostOnly.limit, gib(16));
assert.equal(hostOnly.maxWorkers, 4);
assert.equal(hostOnly.workerHeapLimit, 512 * MIB);

console.log(JSON.stringify({ cases, hostOnly }, null, 2));
