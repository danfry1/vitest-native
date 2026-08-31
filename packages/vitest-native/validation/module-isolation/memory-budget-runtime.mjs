import os from "node:os";
import { memoryPlan } from "./memory-budget.mjs";

const MIB = 1024 * 1024;
const constrainedMemory = process.constrainedMemory?.() ?? 0;
const expectedMiB = Number(process.env.VN_EXPECT_MEMORY_MIB ?? 0);
const tolerance = 2 * MIB;

if (expectedMiB > 0 && Math.abs(constrainedMemory - expectedMiB * MIB) > tolerance) {
  throw new Error(
    `Node reported ${constrainedMemory / MIB} MiB constrained memory; expected ${expectedMiB} MiB`,
  );
}

const plan = memoryPlan({
  totalMemory: os.totalmem(),
  constrainedMemory,
  requestedWorkers: 16,
});

if (constrainedMemory > 0 && plan.limit !== constrainedMemory) {
  throw new Error(
    `planner chose ${plan.limit} instead of Node's ${constrainedMemory} byte constraint`,
  );
}
if (plan.hardRssLimit != null && plan.hardRssLimit >= constrainedMemory) {
  throw new Error("hard RSS limit must retain cgroup headroom");
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      totalMemory: os.totalmem(),
      constrainedMemory,
      availableMemory: process.availableMemory?.() ?? null,
      plan,
    },
    null,
    2,
  ),
);
