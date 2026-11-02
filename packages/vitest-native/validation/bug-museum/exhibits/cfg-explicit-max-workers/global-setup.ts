// Hands the resolved worker count to the tests.
import type { TestProject } from "vitest/node";

export default function setup(project: TestProject) {
  project.provide("maxWorkers", project.config.maxWorkers ?? project.vitest.config.maxWorkers);
}

declare module "vitest" {
  export interface ProvidedContext {
    maxWorkers: number;
  }
}
