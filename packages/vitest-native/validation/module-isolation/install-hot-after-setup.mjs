import { captureModuleBaseline } from "./node_modules/vitest-native/dist/native/module-reset.mjs";
import { installHotReset } from "./node_modules/vitest-native/dist/native/reset.mjs";

if (globalThis.__vitest_native_module_mode_bootstrap) {
  const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
  const diagnostics = process.env.VITEST_NATIVE_DIAGNOSTICS === "true";
  let preserveGlobals = [];
  try {
    if (process.env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS) {
      preserveGlobals = JSON.parse(process.env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS);
    }
  } catch {}

  const resetNodeModules = captureModuleBaseline();
  const { hotReset, bless } = installHotReset({
    projectRoot,
    diagnostics,
    preserveGlobals,
  });

  // Establish the pristine per-file baseline before the first test module imports.
  hotReset();
  globalThis.__vitest_native_hot_reset = () => {
    globalThis.__vitest_native_registry_reset?.();
    if (globalThis.__vitest_native_hot_generation) {
      Atomics.add(globalThis.__vitest_native_hot_generation, 0, 1);
    }
    const dropped = resetNodeModules();
    hotReset();
    if (diagnostics) {
      console.log(`[vitest-native] module-mode reset: dropped ${dropped} Node modules`);
    }
  };
  globalThis.__vitest_native_hot_bless = bless;
  delete globalThis.__vitest_native_module_mode_bootstrap;
}
