// Reading and writing project contexts in tests (src/context.mjs).
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import {
  CONTEXT_ENV,
  contextFieldsFromSettings,
  localResolverView,
  projectContext,
  writeProjectContext,
  type ProjectContextFields,
} from "../src/context.mjs";

/** The context a plugin config hands its workers. */
export function contextOf(config: unknown): Readonly<ProjectContextFields> {
  const env =
    (config as { test?: { env?: Record<string, string> }; env?: Record<string, string> })?.test
      ?.env ?? (config as { env?: Record<string, string> })?.env;
  const context = projectContext(env?.[CONTEXT_ENV]);
  if (!context) throw new Error(`no ${CONTEXT_ENV} in the config's env`);
  return context;
}

const cacheRoot = path.join(os.tmpdir(), "vitest-native-test-contexts");

/**
 * Point this worker at a context built from `settings`, the variables the plugin
 * assembles, over the base a run needs. Undone by vi.unstubAllEnvs().
 */
export function stubProjectContext(settings: Record<string, string>): void {
  const root = settings.VITEST_NATIVE_PROJECT_ROOT ?? process.cwd();
  const fields = contextFieldsFromSettings({
    VITEST_NATIVE_PLATFORM: "ios",
    VITEST_NATIVE_DIAGNOSTICS: "false",
    VITEST_NATIVE_PROJECT_ROOT: root,
    VITEST_NATIVE_RESOLVER_INPUTS: resolverInputsSetting(root),
    ...settings,
  });
  vi.stubEnv(CONTEXT_ENV, writeProjectContext(fields, cacheRoot));
}

/** The resolver-input record a run in this process would get, as its setting string. */
export function resolverInputsSetting(projectRoot: string, platform = "ios"): string {
  return JSON.stringify({
    projectRoot,
    platform,
    sourceExts: ["js", "jsx", "json", "ts", "tsx"],
    ...localResolverView(),
    viteConditions: [],
    aliases: { entries: [], skipped: [] },
  });
}
