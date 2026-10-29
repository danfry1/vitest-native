// Reading and writing project contexts in tests (src/context.mjs).
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import {
  CONTEXT_ENV,
  projectContext,
  writeProjectContext,
  type ProjectContextFields,
} from "../src/context.mjs";

/** The context a plugin config hands its workers. */
export function contextOf(config: unknown): Readonly<ProjectContextFields> {
  const c = config as { test?: { env?: Record<string, string> }; env?: Record<string, string> };
  const context = projectContext((c?.test?.env ?? c?.env)?.[CONTEXT_ENV]);
  if (!context) throw new Error(`no ${CONTEXT_ENV} in the config's env`);
  return context;
}

export const testCacheRoot = path.join(os.tmpdir(), "vitest-native-test-contexts");

/** A context's reference, with the fields a run always has filled in. */
export function testContext(fields: Partial<ProjectContextFields> = {}, root = testCacheRoot) {
  return writeProjectContext(
    { platform: "ios", diagnostics: false, projectRoot: process.cwd(), ...fields },
    root,
  );
}

/** Point this worker at a context with `fields`. Undone by vi.unstubAllEnvs(). */
export function stubProjectContext(fields: Partial<ProjectContextFields>): void {
  vi.stubEnv(CONTEXT_ENV, testContext(fields));
}
